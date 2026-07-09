import {
  isSupportedRepairAction,
  type CoordinatorBoundedRepairPlan,
  type CoordinatorRepairStep
} from './repair-planner'

export type CoordinatorRepairExecutionStatus =
  | 'queued'
  | 'completed'
  | 'skipped'

export type CoordinatorRepairSkipReason =
  | 'already_completed'
  | 'invalid_step'
  | 'max_attempts_exhausted'
  | 'no_supported_repair_steps_available'
  | 'unsupported_repair_action'

export type CoordinatorRepairRetryPolicy = {
  maxAttemptsPerStep: number
  baseDelayMs: number
  maxDelayMs: number
}

export type CoordinatorRepairExecutionRecord = {
  stepId: string
  action: string
  source: CoordinatorRepairStep['source']
  priority: CoordinatorRepairStep['priority']
  status: CoordinatorRepairExecutionStatus
  attempt: number
  maxAttempts: number
  retryDelayMs: number | null
  reason: string
  skipReason?: CoordinatorRepairSkipReason
  evidenceIds: string[]
  claimIds: string[]
}

export type CoordinatorRepairExecutorInput = {
  plan: CoordinatorBoundedRepairPlan
  completedStepIds?: string[]
  priorAttemptsByStepId?: Record<string, number>
  maxAttemptsPerStep?: number
  baseDelayMs?: number
  maxDelayMs?: number
}

export type CoordinatorRepairExecutorPlan = {
  canExecute: boolean
  retryPolicy: CoordinatorRepairRetryPolicy
  records: CoordinatorRepairExecutionRecord[]
  blockedReasons: string[]
}

const DEFAULT_MAX_ATTEMPTS_PER_STEP = 2
const MAX_ATTEMPTS_PER_STEP_CAP = 5
const DEFAULT_BASE_DELAY_MS = 1000
const DEFAULT_MAX_DELAY_MS = 30_000
const MAX_DELAY_MS_CAP = 300_000

function boundedNonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback
}

function boundedPositiveInteger(
  value: unknown,
  fallback: number,
  cap: number
): number {
  const bounded = boundedNonNegativeInteger(value, fallback)
  return Math.min(cap, Math.max(1, bounded))
}

function stableString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(item => typeof item === 'string'))]
}

function safeCompletedStepIds(value: unknown): Set<string> {
  return new Set(safeStringArray(value))
}

function safePriorAttempts(
  value: unknown,
  maxAttempts: number
): Map<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return new Map()
  }

  return new Map(
    Object.entries(value).flatMap(([stepId, attempts]) => {
      const safeStepId = stableString(stepId)
      if (!safeStepId) return []

      return [
        [
          safeStepId,
          Math.min(
            maxAttempts,
            boundedNonNegativeInteger(attempts, 0)
          )
        ] as const
      ]
    })
  )
}

function createRetryPolicy(
  input: CoordinatorRepairExecutorInput
): CoordinatorRepairRetryPolicy {
  const maxAttemptsPerStep = boundedPositiveInteger(
    input.maxAttemptsPerStep,
    DEFAULT_MAX_ATTEMPTS_PER_STEP,
    MAX_ATTEMPTS_PER_STEP_CAP
  )
  const baseDelayMs = boundedPositiveInteger(
    input.baseDelayMs,
    DEFAULT_BASE_DELAY_MS,
    MAX_DELAY_MS_CAP
  )
  const maxDelayMs = Math.max(
    baseDelayMs,
    boundedPositiveInteger(
      input.maxDelayMs,
      DEFAULT_MAX_DELAY_MS,
      MAX_DELAY_MS_CAP
    )
  )

  return {
    maxAttemptsPerStep,
    baseDelayMs,
    maxDelayMs
  }
}

function retryDelayMs(
  nextAttempt: number,
  retryPolicy: CoordinatorRepairRetryPolicy
): number | null {
  if (nextAttempt <= 1) return null

  const exponent = Math.max(0, nextAttempt - 2)
  return Math.min(
    retryPolicy.maxDelayMs,
    retryPolicy.baseDelayMs * 2 ** exponent
  )
}

function invalidStepRecord(
  index: number,
  retryPolicy: CoordinatorRepairRetryPolicy
): CoordinatorRepairExecutionRecord {
  return {
    stepId: `invalid_step_${index + 1}`,
    action: 'invalid_repair_step',
    source: 'policy_action',
    priority: 'low',
    status: 'skipped',
    attempt: 0,
    maxAttempts: retryPolicy.maxAttemptsPerStep,
    retryDelayMs: null,
    reason: 'Repair step is missing a stable id or action.',
    skipReason: 'invalid_step',
    evidenceIds: [],
    claimIds: []
  }
}

function toExecutionRecord(
  step: CoordinatorRepairStep,
  index: number,
  completedStepIds: Set<string>,
  priorAttemptsByStepId: Map<string, number>,
  retryPolicy: CoordinatorRepairRetryPolicy
): CoordinatorRepairExecutionRecord {
  const stepId = stableString(step?.id)
  const action = stableString(step?.action)

  if (!stepId || !action) {
    return invalidStepRecord(index, retryPolicy)
  }

  const baseRecord = {
    stepId,
    action,
    source: step.source,
    priority: step.priority,
    maxAttempts: retryPolicy.maxAttemptsPerStep,
    evidenceIds: safeStringArray(step.evidenceIds),
    claimIds: safeStringArray(step.claimIds)
  }

  if (!isSupportedRepairAction(action)) {
    return {
      ...baseRecord,
      status: 'skipped',
      attempt: 0,
      retryDelayMs: null,
      reason: 'Repair action is not supported by the audited executor.',
      skipReason: 'unsupported_repair_action'
    }
  }

  if (completedStepIds.has(stepId)) {
    return {
      ...baseRecord,
      status: 'completed',
      attempt: Math.max(1, priorAttemptsByStepId.get(stepId) ?? 1),
      retryDelayMs: null,
      reason: 'Repair step was already completed.',
      skipReason: 'already_completed'
    }
  }

  const priorAttempts = priorAttemptsByStepId.get(stepId) ?? 0
  if (priorAttempts >= retryPolicy.maxAttemptsPerStep) {
    return {
      ...baseRecord,
      status: 'skipped',
      attempt: priorAttempts,
      retryDelayMs: null,
      reason: 'Repair step has exhausted its retry attempts.',
      skipReason: 'max_attempts_exhausted'
    }
  }

  const nextAttempt = priorAttempts + 1
  return {
    ...baseRecord,
    status: 'queued',
    attempt: nextAttempt,
    retryDelayMs: retryDelayMs(nextAttempt, retryPolicy),
    reason: 'Repair step is queued for audited execution.'
  }
}

export function createAuditedRepairExecutorPlan(
  input: CoordinatorRepairExecutorInput
): CoordinatorRepairExecutorPlan {
  const retryPolicy = createRetryPolicy(input)
  const completedStepIds = safeCompletedStepIds(input.completedStepIds)
  const priorAttemptsByStepId = safePriorAttempts(
    input.priorAttemptsByStepId,
    retryPolicy.maxAttemptsPerStep
  )
  const steps = Array.isArray(input.plan?.steps) ? input.plan.steps : []
  const records = steps.map((step, index) =>
    toExecutionRecord(
      step,
      index,
      completedStepIds,
      priorAttemptsByStepId,
      retryPolicy
    )
  )
  const canExecute = records.some(record => record.status === 'queued')
  const blockedReasons = canExecute
    ? []
    : input.plan?.blockedReasons?.length
      ? input.plan.blockedReasons
      : ['no_supported_repair_steps_available']

  return {
    canExecute,
    retryPolicy,
    records,
    blockedReasons
  }
}
