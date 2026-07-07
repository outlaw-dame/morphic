import {
  buildEvidenceGraph,
  type EvidenceGraph,
  type EvidenceGraphInput
} from '@/lib/ai-architecture/evidence'
import type { RoutePlan } from '@/lib/ai/schemas'

import { coordinateExecution, type CoordinatorEvaluation } from './coordinator'
import { createCoordinatorExecutionState } from './execution-state'

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

export type CoordinatorAdmission = CoordinatorEvaluation & {
  status: CoordinatorAdmissionStatus
  canCompose: boolean
  blockedPolicyIds: string[]
  warningPolicyIds: string[]
  requiredRepairActions: string[]
}

function toAdmission(evaluation: CoordinatorEvaluation): CoordinatorAdmission {
  const blockedPolicyIds = evaluation.policyResults
    .filter(result => !result.passed && result.severity === 'block')
    .map(result => result.id)
  const warningPolicyIds = evaluation.policyResults
    .filter(result => !result.passed && result.severity === 'warn')
    .map(result => result.id)
  const canCompose = evaluation.repairPlan.canProceedToComposition

  return {
    ...evaluation,
    status: canCompose ? 'compose' : 'repair',
    canCompose,
    blockedPolicyIds,
    warningPolicyIds,
    requiredRepairActions: [...new Set(evaluation.repairPlan.actions)]
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
