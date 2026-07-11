import type { EvidenceGraph } from '@/lib/ai-architecture/evidence'
import {
  type ModelRole,
  ModelRoleSchema,
  type RoutePlan
} from '@/lib/ai/schemas'

export type CoordinatorStage =
  | 'post_retrieval_pre_composition'
  | 'post_composition_pre_release'

export type CoordinatorExecutionState = {
  routePlan: RoutePlan
  evidenceGraph: EvidenceGraph
  retrievalAttempts: number
  maxRetrievalAttempts: number
  completedRoles: ModelRole[]
  stage?: CoordinatorStage
}

export function createCoordinatorExecutionState(input: {
  routePlan: RoutePlan
  evidenceGraph: EvidenceGraph
  retrievalAttempts?: number
  maxRetrievalAttempts?: number
  completedRoles?: readonly unknown[]
  stage?: CoordinatorStage
}): CoordinatorExecutionState {
  const completedRoles = [...new Set(input.completedRoles ?? [])].map(role =>
    ModelRoleSchema.parse(role)
  )

  return {
    routePlan: input.routePlan,
    evidenceGraph: input.evidenceGraph,
    retrievalAttempts: Math.max(0, input.retrievalAttempts ?? 0),
    maxRetrievalAttempts: Math.max(1, input.maxRetrievalAttempts ?? 2),
    completedRoles,
    stage: input.stage
  }
}
