import {
  buildEvidenceGraph,
  type EvidenceGraph,
  type EvidenceGraphInput
} from '@/lib/ai-architecture/evidence'
import type { RoutePlan } from '@/lib/ai/schemas'

import { coordinateExecution, type CoordinatorEvaluation } from './coordinator'
import { createCoordinatorExecutionState } from './execution-state'
import type {
  CoordinatorPolicyDetail,
  CoordinatorPolicyResult
} from './policy-types'
import {
  createBoundedRepairPlan,
  DEFAULT_MAX_REPAIR_STEPS,
  isSupportedRepairAction,
  type CoordinatorBoundedRepairPlan
} from './repair-planner'

export type CoordinatorAdmissionStatus = 'compose' | 'repair'

export type CoordinatorAdmissionInput = {
  routePlan: RoutePlan
  evidenceGraph: EvidenceGraph
  retrievalAttempts?: number
  maxRetrievalAttempts?: number
  completedRoles?: string[]
  now?: Date
}

export type CoordinatorSearchAdmissionInput = Omit<
  CoordinatorAdmissionInput,
  'evidenceGraph'
> & {
  evidenceInput: EvidenceGraphInput
}

export type CoordinatorAdmissionConflictDetail = CoordinatorPolicyDetail & {
  policyId: string
}

export type CoordinatorAdmissionConflictRepairHint = {
  id: string
  policyId: string
  conflictId?: string
  action: string
  priority: 'high' | 'medium'
  evidenceIds: string[]
  claimIds: string[]
  reason: string
}

export type CoordinatorAdmission = CoordinatorEvaluation & {
  status: CoordinatorAdmissionStatus
  canCompose: boolean
  blockedPolicyIds: string[]
  warningPolicyIds: string[]
  requiredRepairActions: string[]
  conflictDetails: CoordinatorAdmissionConflictDetail[]
  conflictRepairHints: CoordinatorAdmissionConflictRepairHint[]
  boundedRepairPlan: CoordinatorBoundedRepairPlan
}

const DEFAULT_MAX_RETRIEVAL_ATTEMPTS = 2

function stableStringId(value: unknown, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : undefined
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

function safeStringArray(value: unknown): string[] {
  const arr = Array.isArray(value) ? value : []
  return [...new Set(arr.filter(item => typeof item === 'string'))]
}

function boundedNonNegativeInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.floor(value ?? fallback))
}

function isRetrievalAction(action: string): boolean {
  return action.startsWith('retrieve_')
}

function remainingRetrievalBudget(input: CoordinatorAdmissionInput): number {
  const retrievalAttempts = boundedNonNegativeInteger(input.retrievalAttempts, 0)
  const maxRetrievalAttempts = boundedNonNegativeInteger(
    input.maxRetrievalAttempts,
    DEFAULT_MAX_RETRIEVAL_ATTEMPTS
  )

  return Math.max(0, maxRetrievalAttempts - retrievalAttempts)
}

function repairActionForConflictType(type: string): string {
  if (type === 'evidence_conflict:numeric_mismatch') {
    return 'retrieve_primary_numeric_source'
  }
  if (type === 'evidence_conflict:status_mismatch') {
    return 'retrieve_current_status_source'
  }
  return 'retrieve_independent_corroboration'
}

function repairReasonForConflictType(type: string): string {
  if (type === 'evidence_conflict:numeric_mismatch') {
    return 'Resolve conflicting numeric claims with primary or authoritative numeric sources.'
  }
  if (type === 'evidence_conflict:status_mismatch') {
    return 'Resolve conflicting status claims with current authoritative status sources.'
  }
  return 'Resolve conflicting claims with independent corroborating sources.'
}

export function toAdmissionConflictDetails(
  policyResults: CoordinatorPolicyResult[]
): CoordinatorAdmissionConflictDetail[] {
  return policyResults.flatMap(result =>
    (result.details ?? [])
      .filter(
        detail =>
          typeof detail?.type === 'string' &&
          detail.type.startsWith('evidence_conflict:')
      )
      .map(detail => ({
        ...detail,
        policyId: result.id
      }))
  )
}

export function toAdmissionConflictRepairHints(
  conflictDetails: CoordinatorAdmissionConflictDetail[]
): CoordinatorAdmissionConflictRepairHint[] {
  return conflictDetails.map((detail, index) => {
    const fallbackId = `conflict_${index + 1}`
    const conflictId = stableStringId(detail.id, fallbackId)
    const realConflictId =
      typeof detail.id === 'string' && detail.id.trim().length > 0
        ? detail.id.trim()
        : undefined

    return {
      id: `${detail.policyId}:${conflictId}:repair_hint`,
      policyId: detail.policyId,
      conflictId: realConflictId,
      action: repairActionForConflictType(detail.type),
      priority: detail.severity === 'block' ? 'high' : 'medium',
      evidenceIds: safeStringArray(detail.evidenceIds),
      claimIds: safeStringArray(detail.claimIds),
      reason: repairReasonForConflictType(detail.type)
    }
  })
}

function toBlockingRepairActions(
  evaluation: CoordinatorEvaluation,
  blockedPolicyIds: string[],
  requiredRepairActions: string[]
): string[] {
  if (blockedPolicyIds.length === 0) return requiredRepairActions

  const policyRepairActions = new Set(
    evaluation.policyResults.flatMap(result => result.repairActions ?? [])
  )
  const blockingPolicyRepairActions = evaluation.policyResults
    .filter(result => !result.passed && result.severity === 'block')
    .flatMap(result => result.repairActions ?? [])
  const escalationRepairActions = requiredRepairActions.filter(
    action => !policyRepairActions.has(action)
  )

  return [...new Set([...blockingPolicyRepairActions, ...escalationRepairActions])]
}

function supportedActions(actions: string[]): string[] {
  return actions.filter(isSupportedRepairAction)
}

function toBlockingConflictRepairHints(
  conflictRepairHints: CoordinatorAdmissionConflictRepairHint[],
  blockedPolicyIds: string[],
  blockingRepairActions: string[],
  input: CoordinatorAdmissionInput
): CoordinatorAdmissionConflictRepairHint[] {
  if (blockedPolicyIds.length === 0) return conflictRepairHints

  const blockedPolicyIdSet = new Set(blockedPolicyIds)
  const supportedBlockingRepairActions = supportedActions(blockingRepairActions)
  const blockingRepairActionSet = new Set(supportedBlockingRepairActions)
  const highHintActions = new Set(
    supportedActions(
      conflictRepairHints
        .filter(hint => hint.priority === 'high')
        .map(hint => hint.action)
    )
  )
  const committedActions = new Set([
    ...blockingRepairActionSet,
    ...highHintActions
  ])
  const committedRetrievalActions = new Set(
    [...committedActions].filter(isRetrievalAction)
  )
  let availableMediumHintSlots = Math.max(
    0,
    DEFAULT_MAX_REPAIR_STEPS - committedActions.size
  )
  let availableMediumHintRetrievalBudget = Math.max(
    0,
    remainingRetrievalBudget(input) - committedRetrievalActions.size
  )
  const seenActions = new Set(committedActions)

  return conflictRepairHints.filter(hint => {
    if (hint.priority === 'high') return true
    if (!blockedPolicyIdSet.has(hint.policyId)) return false
    if (!isSupportedRepairAction(hint.action)) return false
    if (seenActions.has(hint.action)) return true
    if (availableMediumHintSlots <= 0) return false

    if (isRetrievalAction(hint.action)) {
      if (availableMediumHintRetrievalBudget <= 0) return false
      availableMediumHintRetrievalBudget -= 1
    }

    availableMediumHintSlots -= 1
    seenActions.add(hint.action)
    return true
  })
}

function createAdmissionBoundedRepairPlan(
  evaluation: CoordinatorEvaluation,
  input: CoordinatorAdmissionInput,
  canCompose: boolean,
  blockedPolicyIds: string[],
  requiredRepairActions: string[],
  conflictRepairHints: CoordinatorAdmissionConflictRepairHint[]
): CoordinatorBoundedRepairPlan {
  const boundedRepairActions = canCompose
    ? []
    : toBlockingRepairActions(evaluation, blockedPolicyIds, requiredRepairActions)
  const boundedConflictRepairHints = canCompose
    ? []
    : toBlockingConflictRepairHints(
        conflictRepairHints,
        blockedPolicyIds,
        boundedRepairActions,
        input
      )

  return createBoundedRepairPlan({
    routePlan: input.routePlan,
    requiredRepairActions: boundedRepairActions,
    conflictRepairHints: boundedConflictRepairHints,
    retrievalAttempts: input.retrievalAttempts,
    maxRetrievalAttempts: input.maxRetrievalAttempts
  })
}

function toAdmission(
  evaluation: CoordinatorEvaluation,
  input: CoordinatorAdmissionInput
): CoordinatorAdmission {
  const blockedPolicyIds = evaluation.policyResults
    .filter(result => !result.passed && result.severity === 'block')
    .map(result => result.id)
  const warningPolicyIds = evaluation.policyResults
    .filter(result => !result.passed && result.severity === 'warn')
    .map(result => result.id)
  const canCompose = evaluation.repairPlan.canProceedToComposition
  const requiredRepairActions = [...new Set(evaluation.repairPlan.actions)]
  const conflictDetails = toAdmissionConflictDetails(evaluation.policyResults)
  const conflictRepairHints = toAdmissionConflictRepairHints(conflictDetails)
  const boundedRepairPlan = createAdmissionBoundedRepairPlan(
    evaluation,
    input,
    canCompose,
    blockedPolicyIds,
    requiredRepairActions,
    conflictRepairHints
  )

  return {
    ...evaluation,
    status: canCompose ? 'compose' : 'repair',
    canCompose,
    blockedPolicyIds,
    warningPolicyIds,
    requiredRepairActions,
    conflictDetails,
    conflictRepairHints,
    boundedRepairPlan
  }
}

export function createCoordinatorAdmission(
  input: CoordinatorAdmissionInput
): CoordinatorAdmission {
  const state = createCoordinatorExecutionState({
    routePlan: input.routePlan,
    evidenceGraph: input.evidenceGraph,
    retrievalAttempts: input.retrievalAttempts,
    maxRetrievalAttempts: input.maxRetrievalAttempts,
    completedRoles: input.completedRoles
  })

  return toAdmission(coordinateExecution(state, input.now), input)
}

export function createCoordinatorAdmissionFromSearchResults(
  input: CoordinatorSearchAdmissionInput
): CoordinatorAdmission {
  const evidenceGraph = buildEvidenceGraph(input.evidenceInput)

  return createCoordinatorAdmission({
    routePlan: input.routePlan,
    evidenceGraph,
    retrievalAttempts: input.retrievalAttempts,
    maxRetrievalAttempts: input.maxRetrievalAttempts,
    completedRoles: input.completedRoles,
    now: input.now
  })
}
