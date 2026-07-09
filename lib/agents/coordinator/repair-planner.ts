import type { RoutePlan } from '@/lib/ai/schemas'

import type { CoordinatorAdmissionConflictRepairHint } from './admission'

export type CoordinatorRepairStepSource = 'policy_action' | 'conflict_hint'
export type CoordinatorRepairStepPriority = 'high' | 'medium' | 'low'

export type CoordinatorRepairStep = {
  id: string
  action: string
  source: CoordinatorRepairStepSource
  priority: CoordinatorRepairStepPriority
  reason: string
  evidenceIds: string[]
  claimIds: string[]
  originalAction?: string
}

export type CoordinatorSkippedRepairAction = {
  action: string
  reason:
    | 'duplicate_action'
    | 'retrieval_attempt_budget_exhausted'
    | 'unsupported_repair_action'
    | 'max_steps_reached'
  source: CoordinatorRepairStepSource
}

export type CoordinatorBoundedRepairPlanInput = {
  routePlan?: RoutePlan | null
  requiredRepairActions?: string[] | null
  conflictRepairHints?: CoordinatorAdmissionConflictRepairHint[] | null
  retrievalAttempts?: number
  maxRetrievalAttempts?: number
  maxSteps?: number
}

export type CoordinatorBoundedRepairPlan = {
  canAttemptRepair: boolean
  remainingRetrievalAttempts: number
  steps: CoordinatorRepairStep[]
  skippedActions: CoordinatorSkippedRepairAction[]
  blockedReasons: string[]
}

type RepairCandidate = {
  action: string
  source: CoordinatorRepairStepSource
  priority: CoordinatorRepairStepPriority
  reason: string
  evidenceIds: string[]
  claimIds: string[]
}

const DEFAULT_MAX_RETRIEVAL_ATTEMPTS = 2
export const DEFAULT_MAX_REPAIR_STEPS = 5

const SUPPORTED_REPAIR_ACTIONS = new Set([
  'retrieve_authoritative_sources',
  'retrieve_current_status_source',
  'retrieve_disambiguating_sources',
  'retrieve_fresh_sources',
  'retrieve_independent_corroboration',
  'retrieve_independent_sources',
  'retrieve_more_sources',
  'retrieve_primary_numeric_source',
  'retrieve_required_source_classes',
  'run_advisor_review',
  'run_citation_verifier',
  'run_contradiction_review',
  'run_entity_grounding',
  'select_stronger_model'
])

const RETRIEVAL_ACTIONS = new Set([
  'retrieve_authoritative_sources',
  'retrieve_current_status_source',
  'retrieve_disambiguating_sources',
  'retrieve_fresh_sources',
  'retrieve_independent_corroboration',
  'retrieve_independent_sources',
  'retrieve_more_sources',
  'retrieve_primary_numeric_source',
  'retrieve_required_source_classes'
])

const BROAD_HIGH_RISK_RETRIEVAL_REPLACEMENTS = new Map([
  ['retrieve_more_sources', 'retrieve_authoritative_sources'],
  ['retrieve_independent_sources', 'retrieve_independent_corroboration']
])

function isHighAssuranceRoute(routePlan: RoutePlan | null | undefined): boolean {
  return (
    routePlan?.riskLevel === 'high' ||
    routePlan?.riskLevel === 'critical' ||
    routePlan?.mode === 'critical'
  )
}

function normalizeRepairAction(
  action: string,
  routePlan: RoutePlan | null | undefined
): string {
  if (!isHighAssuranceRoute(routePlan)) return action
  return BROAD_HIGH_RISK_RETRIEVAL_REPLACEMENTS.get(action) ?? action
}

export function isSupportedRepairAction(action: string): boolean {
  return SUPPORTED_REPAIR_ACTIONS.has(action)
}

function isRetrievalAction(action: string): boolean {
  return RETRIEVAL_ACTIONS.has(action)
}

function priorityRank(priority: CoordinatorRepairStepPriority): number {
  if (priority === 'high') return 0
  if (priority === 'medium') return 1
  return 2
}

function safeAction(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(item => typeof item === 'string'))]
}

function safePriority(value: unknown): CoordinatorRepairStepPriority {
  if (value === 'high' || value === 'medium') return value
  return 'low'
}

function safeReason(value: unknown, action: string): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : policyActionReason(action)
}

function policyActionReason(action: string): string {
  if (action === 'retrieve_authoritative_sources') {
    return 'Retrieve authoritative sources before composition.'
  }
  if (action === 'retrieve_required_source_classes') {
    return 'Retrieve the source classes required by the route plan.'
  }
  if (action === 'retrieve_fresh_sources') {
    return 'Retrieve fresh sources for the freshness-sensitive route.'
  }
  if (action === 'retrieve_disambiguating_sources') {
    return 'Retrieve sources that disambiguate ambiguous grounded entities.'
  }
  if (action === 'run_entity_grounding') {
    return 'Run entity grounding before composition.'
  }
  if (action === 'run_contradiction_review') {
    return 'Review contradictory evidence before composition.'
  }
  if (action === 'run_advisor_review') {
    return 'Escalate to advisor review before composition.'
  }
  if (action === 'run_citation_verifier') {
    return 'Verify citations before final composition.'
  }
  if (action === 'select_stronger_model') {
    return 'Select a stronger model for the remaining reasoning step.'
  }
  if (action === 'retrieve_independent_sources') {
    return 'Retrieve independent sources to improve source diversity.'
  }
  if (action === 'retrieve_more_sources') {
    return 'Retrieve more sources before composition.'
  }
  return 'Run the requested deterministic repair action.'
}

function policyActionPriority(action: string): CoordinatorRepairStepPriority {
  if (
    action === 'run_advisor_review' ||
    action === 'select_stronger_model' ||
    action === 'retrieve_authoritative_sources' ||
    action === 'run_contradiction_review'
  ) {
    return 'high'
  }
  if (action === 'run_citation_verifier' || action === 'run_entity_grounding') {
    return 'medium'
  }
  return 'low'
}

function hintCandidates(
  hints: CoordinatorAdmissionConflictRepairHint[] | null | undefined
): RepairCandidate[] {
  return (hints ?? []).flatMap(hint => {
    const action = safeAction(hint?.action)
    if (!action) return []

    return [
      {
        action,
        source: 'conflict_hint' as const,
        priority: safePriority(hint.priority),
        reason: safeReason(hint.reason, action),
        evidenceIds: safeStringArray(hint.evidenceIds),
        claimIds: safeStringArray(hint.claimIds)
      }
    ]
  })
}

function policyCandidates(actions: string[] | null | undefined): RepairCandidate[] {
  return (actions ?? []).flatMap(action => {
    const safe = safeAction(action)
    if (!safe) return []
    return [
      {
        action: safe,
        source: 'policy_action' as const,
        priority: policyActionPriority(safe),
        reason: policyActionReason(safe),
        evidenceIds: [],
        claimIds: []
      }
    ]
  })
}

function boundedNonNegativeInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.floor(value ?? fallback))
}

export function createBoundedRepairPlan(
  input: CoordinatorBoundedRepairPlanInput
): CoordinatorBoundedRepairPlan {
  const retrievalAttempts = boundedNonNegativeInteger(input.retrievalAttempts, 0)
  const maxRetrievalAttempts = boundedNonNegativeInteger(
    input.maxRetrievalAttempts,
    DEFAULT_MAX_RETRIEVAL_ATTEMPTS
  )
  const maxSteps = boundedNonNegativeInteger(input.maxSteps, DEFAULT_MAX_REPAIR_STEPS)
  let remainingRetrievalBudget = Math.max(
    0,
    maxRetrievalAttempts - retrievalAttempts
  )
  const candidates = [
    ...hintCandidates(input.conflictRepairHints ?? []),
    ...policyCandidates(input.requiredRepairActions ?? [])
  ].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))

  const seenActions = new Set<string>()
  const steps: CoordinatorRepairStep[] = []
  const skippedActions: CoordinatorSkippedRepairAction[] = []

  for (const candidate of candidates) {
    const normalizedAction = normalizeRepairAction(candidate.action, input.routePlan)

    if (!isSupportedRepairAction(normalizedAction)) {
      skippedActions.push({
        action: candidate.action,
        reason: 'unsupported_repair_action',
        source: candidate.source
      })
      continue
    }

    if (seenActions.has(normalizedAction)) {
      skippedActions.push({
        action: normalizedAction,
        reason: 'duplicate_action',
        source: candidate.source
      })
      continue
    }

    if (isRetrievalAction(normalizedAction) && remainingRetrievalBudget <= 0) {
      skippedActions.push({
        action: normalizedAction,
        reason: 'retrieval_attempt_budget_exhausted',
        source: candidate.source
      })
      continue
    }

    if (steps.length >= maxSteps) {
      skippedActions.push({
        action: normalizedAction,
        reason: 'max_steps_reached',
        source: candidate.source
      })
      continue
    }

    seenActions.add(normalizedAction)
    if (isRetrievalAction(normalizedAction)) {
      remainingRetrievalBudget -= 1
    }

    steps.push({
      id: `repair_step_${steps.length + 1}:${normalizedAction}`,
      action: normalizedAction,
      source: candidate.source,
      priority: candidate.priority,
      reason: candidate.reason,
      evidenceIds: candidate.evidenceIds,
      claimIds: candidate.claimIds,
      ...(normalizedAction !== candidate.action
        ? { originalAction: candidate.action }
        : {})
    })
  }

  return {
    canAttemptRepair: steps.length > 0,
    remainingRetrievalAttempts: remainingRetrievalBudget,
    steps,
    skippedActions,
    blockedReasons:
      steps.length > 0 ? [] : ['no_supported_repair_steps_available']
  }
}
