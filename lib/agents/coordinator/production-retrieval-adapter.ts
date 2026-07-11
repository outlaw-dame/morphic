import {
  createRouteExecutionContext,
  type RouteExecutionContext
} from '@/lib/ai/router/execution-context'
import type { ModelRole } from '@/lib/ai/schemas'
import type { SearchResultItem } from '@/lib/types'

import type {
  GovernedRetrievalAdapter,
  GovernedRetrievalResult
} from './governed-pipeline'

const MAX_RESULTS = 500
const MAX_COMPLETED_ROLES = 32
const MAX_REPAIR_ACTIONS = 32
const MAX_REPAIR_ACTION_LENGTH = 128

export type ProductionRetrievalExecutor = Readonly<{
  execute(input: Readonly<{
    query: string
    routeContext: RouteExecutionContext
    attempt: number
    repairActions: readonly string[]
    signal?: AbortSignal
  }>): Promise<unknown>
}>

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason

  const message =
    typeof signal.reason === 'string'
      ? signal.reason
      : 'The retrieval operation was aborted.'

  throw typeof DOMException !== 'undefined'
    ? new DOMException(message, 'AbortError')
    : new Error(message)
}

function freezeRepairActions(actions: readonly string[]): readonly string[] {
  if (!Array.isArray(actions) || actions.length > MAX_REPAIR_ACTIONS) {
    throw new Error('Invalid production retrieval repair actions.')
  }

  return Object.freeze(
    actions.map(action => {
      if (
        typeof action !== 'string' ||
        action.length === 0 ||
        action.length > MAX_REPAIR_ACTION_LENGTH
      ) {
        throw new Error('Invalid production retrieval repair action.')
      }
      return action
    })
  )
}

function freezeSearchResults(value: unknown): readonly SearchResultItem[] {
  if (!Array.isArray(value) || value.length > MAX_RESULTS) {
    throw new Error('Invalid production retrieval search results.')
  }

  return Object.freeze(
    value.map(item => {
      if (!item || typeof item !== 'object') {
        throw new Error('Invalid production retrieval search result.')
      }

      const candidate = item as Partial<SearchResultItem>
      if (
        typeof candidate.title !== 'string' ||
        typeof candidate.url !== 'string' ||
        candidate.title.length === 0 ||
        candidate.url.length === 0
      ) {
        throw new Error('Invalid production retrieval search result.')
      }

      return Object.freeze({ ...candidate }) as SearchResultItem
    })
  )
}

function freezeCompletedRoles(value: unknown): readonly ModelRole[] {
  if (!Array.isArray(value) || value.length > MAX_COMPLETED_ROLES) {
    throw new Error('Invalid production retrieval completed roles.')
  }

  return Object.freeze(
    value.map(role => {
      if (typeof role !== 'string' || role.length === 0) {
        throw new Error('Invalid production retrieval completed role.')
      }
      return role as ModelRole
    })
  )
}

function normalizeRetrievedAt(value: unknown): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(String(value))
  if (!Number.isFinite(date.getTime())) {
    throw new Error('Invalid production retrieval timestamp.')
  }
  return date
}

function normalizeResult(value: unknown): GovernedRetrievalResult {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid production retrieval result.')
  }

  const candidate = value as Record<string, unknown>
  return Object.freeze({
    searchResults: freezeSearchResults(candidate.searchResults),
    completedRoles: freezeCompletedRoles(candidate.completedRoles),
    retrievedAt: normalizeRetrievedAt(candidate.retrievedAt)
  })
}

export function createProductionRetrievalAdapter(
  executor: ProductionRetrievalExecutor
): GovernedRetrievalAdapter {
  if (typeof executor?.execute !== 'function') {
    throw new Error('Invalid production retrieval executor.')
  }

  return Object.freeze({
    async retrieve(input) {
      const query = typeof input?.query === 'string' ? input.query.trim() : ''
      if (!query) throw new Error('Invalid production retrieval query.')
      if (!Number.isSafeInteger(input.attempt) || input.attempt < 1 || input.attempt > 5) {
        throw new Error('Invalid production retrieval attempt.')
      }

      const routeContext = createRouteExecutionContext(input.routeContext)
      const repairActions = freezeRepairActions(input.repairActions)

      throwIfAborted(input.signal)
      const result = await executor.execute(
        Object.freeze({
          query,
          routeContext,
          attempt: input.attempt,
          repairActions,
          signal: input.signal
        })
      )
      throwIfAborted(input.signal)

      return normalizeResult(result)
    }
  })
}
