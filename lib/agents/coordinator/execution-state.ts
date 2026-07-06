import type { EvidenceGraph } from '@/lib/ai-architecture/evidence'
import type { RoutePlan } from '@/lib/ai/schemas'

export type CoordinatorExecutionState = {
  routePlan: RoutePlan
  evidenceGraph: EvidenceGraph
  retrievalAttempts: number
  maxRetrievalAttempts: number
  completedRoles: string[]
}

export function createCoordinatorExecutionState(input: {
  routePlan: RoutePlan
  evidenceGraph: EvidenceGraph
  retrievalAttempts?: number
  maxRetrievalAttempts?: number
  completedRoles?: string[]
}): CoordinatorExecutionState {
  return {
    routePlan: input.routePlan,
    evidenceGraph: input.evidenceGraph,
    retrievalAttempts: Math.max(0, input.retrievalAttempts ?? 0),
    maxRetrievalAttempts: Math.max(1, input.maxRetrievalAttempts ?? 2),
    completedRoles: [...new Set(input.completedRoles ?? [])]
  }
}
