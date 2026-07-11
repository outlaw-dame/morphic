import { buildEvidenceGraph } from '@/lib/ai-architecture/evidence'
import {
  createRouteExecutionContext,
  type RouteExecutionContext
} from '@/lib/ai/router/execution-context'
import type { ModelRole } from '@/lib/ai/schemas'
import type { SearchResultItem } from '@/lib/types'

import { coordinateExecution, type CoordinatorEvaluation } from './coordinator'
import {
  createCoordinatorExecutionState,
  type CoordinatorExecutionState
} from './execution-state'

const MAX_COORDINATOR_RESULTS = 500
const MAX_COORDINATOR_QUERY_LENGTH = 16_000

export type LiveCoordinatorHandoffInput = Readonly<{
  routeContext: RouteExecutionContext
  query: string
  searchResults: readonly SearchResultItem[]
  completedRoles: readonly ModelRole[]
  retrievalAttempts?: number
  maxRetrievalAttempts?: number
  retrievedAt?: string | Date
  now?: Date
}>

export type LiveCoordinatorHandoffResult = Readonly<{
  routeContext: RouteExecutionContext
  state: CoordinatorExecutionState
  evaluation: CoordinatorEvaluation
}>

function validateDate(value: string | Date | undefined, field: string): void {
  if (value === undefined) return
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid ${field}.`)
  }
}

export function evaluateLiveCoordinatorHandoff(
  input: LiveCoordinatorHandoffInput
): LiveCoordinatorHandoffResult {
  const query = input.query.trim()
  if (!query || query.length > MAX_COORDINATOR_QUERY_LENGTH) {
    throw new Error('Invalid Coordinator query.')
  }
  if (!Array.isArray(input.searchResults)) {
    throw new Error('Coordinator search results must be an array.')
  }
  if (input.searchResults.length > MAX_COORDINATOR_RESULTS) {
    throw new Error('Coordinator search result limit exceeded.')
  }

  validateDate(input.retrievedAt, 'Coordinator retrieval timestamp')
  validateDate(input.now, 'Coordinator clock')

  const routeContext = createRouteExecutionContext({
    routePlan: input.routeContext.routePlan,
    routeDigest: input.routeContext.routeDigest
  })
  const evidenceGraph = buildEvidenceGraph({
    query,
    results: [...input.searchResults],
    ...(input.retrievedAt ? { retrievedAt: input.retrievedAt } : {})
  })
  const state = createCoordinatorExecutionState({
    routePlan: routeContext.routePlan,
    evidenceGraph,
    retrievalAttempts: input.retrievalAttempts,
    maxRetrievalAttempts: input.maxRetrievalAttempts,
    completedRoles: input.completedRoles,
    stage: 'post_retrieval_pre_composition'
  })
  const evaluation = coordinateExecution(state, input.now ?? new Date())

  return Object.freeze({
    routeContext,
    state,
    evaluation
  })
}
