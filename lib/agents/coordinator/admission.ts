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
}

function stableStringId(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

function safeStringArray(value: string[] | undefined): string[] {
  return [...new Set((value ?? []).filter(item => typeof item === 'string'))]
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
    const conflictId = stableStringId(detail.id, `conflict_${index + 1}`)
    return {
      id: `${detail.policyId}:${conflictId}:repair_hint`,
      policyId: detail.policyId,
      conflictId: detail.id,
      action: repairActionForConflictType(detail.type),
      priority: detail.severity === 'block' ? 'high' : 'medium',
      evidenceIds: safeStringArray(detail.evidenceIds),
      claimIds: safeStringArray(detail.claimIds),
      reason: repairReasonForConflictType(detail.type)
    }
  })
}

function toAdmission(evaluation: CoordinatorEvaluation): CoordinatorAdmission {
  const blockedPolicyIds = evaluation.policyResults
    .filter(result => !result.passed && result.severity === 'block')
    .map(result => result.id)
  const warningPolicyIds = evaluation.policyResults
    .filter(result => !result.passed && result.severity === 'warn')
    .map(result => result.id)
  const canCompose = evaluation.repairPlan.canProceedToComposition
  const conflictDetails = toAdmissionConflictDetails(evaluation.policyResults)

  return {
    ...evaluation,
    status: canCompose ? 'compose' : 'repair',
    canCompose,
    blockedPolicyIds,
    warningPolicyIds,
    requiredRepairActions: [...new Set(evaluation.repairPlan.actions)],
    conflictDetails,
    conflictRepairHints: toAdmissionConflictRepairHints(conflictDetails)
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

  return toAdmission(coordinateExecution(state, input.now))
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
