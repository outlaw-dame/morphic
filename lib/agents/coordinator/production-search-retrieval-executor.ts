import {
  createRouteExecutionContext,
  type RouteExecutionContext
} from '@/lib/ai/router/execution-context'
import type { ModelRole } from '@/lib/ai/schemas'
import type { SearchResultItem, SearchResults } from '@/lib/types'

import type { ProductionRetrievalExecutor } from './production-retrieval-adapter'

const MAX_QUERY_LENGTH = 16_000
const MAX_RESULTS = 100
const DEFAULT_RESULTS = 20

const SUPPORTED_REPAIR_ACTIONS = new Set([
  'retrieve_more_sources',
  'retrieve_required_source_classes',
  'retrieve_authoritative_sources',
  'retrieve_independent_sources',
  'retrieve_fresh_sources',
  'retrieve_disambiguating_sources',
  'run_retriever',
  'run_source_quality',
  'run_entity_grounding'
])

export type ProductionSearchPort = Readonly<{
  search(input: Readonly<{
    query: string
    maxResults: number
    searchDepth: 'basic' | 'advanced'
    includeDomains: readonly string[]
    excludeDomains: readonly string[]
    signal?: AbortSignal
  }>): Promise<SearchResults>
}>

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  const message =
    typeof signal.reason === 'string'
      ? signal.reason
      : 'The governed search retrieval operation was aborted.'
  throw typeof DOMException !== 'undefined'
    ? new DOMException(message, 'AbortError')
    : new Error(message)
}

function validateRepairActions(actions: readonly string[]): readonly string[] {
  if (!Array.isArray(actions) || actions.length > 32) {
    throw new Error('Invalid governed search repair actions.')
  }
  const normalized = [...new Set(actions)]
  if (normalized.some(action => !SUPPORTED_REPAIR_ACTIONS.has(action))) {
    throw new Error('Unsupported governed search repair action.')
  }
  return Object.freeze(normalized)
}

function requestedResultCount(
  routeContext: RouteExecutionContext,
  attempt: number,
  repairs: readonly string[]
): number {
  const base = routeContext.routePlan.mode === 'quick' ? DEFAULT_RESULTS : 30
  const repairIncrease = repairs.includes('retrieve_more_sources') ? 20 : 0
  const attemptIncrease = Math.max(0, attempt - 1) * 10
  return Math.min(MAX_RESULTS, base + repairIncrease + attemptIncrease)
}

function completedRoles(routeContext: RouteExecutionContext): readonly ModelRole[] {
  const roles: ModelRole[] = ['router', 'retriever', 'source_quality']
  if (routeContext.routePlan.needsEntityGrounding) {
    roles.push('entity_grounding')
  }
  return Object.freeze(roles)
}

function normalizeResults(value: SearchResults): readonly SearchResultItem[] {
  if (!value || typeof value !== 'object' || !Array.isArray(value.results)) {
    throw new Error('Invalid governed search response.')
  }
  return Object.freeze(value.results.map(item => Object.freeze({ ...item })))
}

export function createProductionSearchRetrievalExecutor(
  port: ProductionSearchPort
): ProductionRetrievalExecutor {
  if (!port || typeof port.search !== 'function') {
    throw new Error('Invalid governed production search port.')
  }

  return Object.freeze({
    async execute(input) {
      if (!input || typeof input !== 'object') {
        throw new Error('Invalid governed search retrieval input.')
      }
      const query = typeof input.query === 'string' ? input.query.trim() : ''
      if (!query || query.length > MAX_QUERY_LENGTH) {
        throw new Error('Invalid governed search retrieval query.')
      }
      const routeContext = createRouteExecutionContext(input.routeContext)
      const repairs = validateRepairActions(input.repairActions)
      throwIfAborted(input.signal)

      const response = await port.search({
        query,
        maxResults: requestedResultCount(routeContext, input.attempt, repairs),
        searchDepth:
          routeContext.routePlan.mode === 'quick' ? 'basic' : 'advanced',
        includeDomains: Object.freeze([]),
        excludeDomains: Object.freeze([]),
        ...(input.signal ? { signal: input.signal } : {})
      })

      throwIfAborted(input.signal)
      return Object.freeze({
        searchResults: normalizeResults(response),
        completedRoles: completedRoles(routeContext),
        retrievedAt: new Date()
      })
    }
  })
}
