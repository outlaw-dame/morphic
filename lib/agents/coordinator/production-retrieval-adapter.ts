import {
  createRouteExecutionContext,
  type RouteExecutionContext
} from '@/lib/ai/router/execution-context'
import {
  ModelRoleSchema,
  SourceClassSchema,
  type ModelRole
} from '@/lib/ai/schemas'
import type { SearchResultItem } from '@/lib/types'

import type {
  FusionRetrievalExecutionReport,
  FusionRetrievalPathOutcome,
  GovernedRetrievalAdapter,
  GovernedRetrievalResult
} from './governed-pipeline'

const MAX_RESULTS = 500
const MAX_COMPLETED_ROLES = 32
const MAX_REPAIR_ACTIONS = 32
const MAX_REPAIR_ACTION_LENGTH = 128
const MAX_FUSION_PATHS = 100
const MAX_REASON_CODES = 32
const MAX_REASON_CODE_LENGTH = 128

const FUSION_PATH_PURPOSES = new Set([
  'primary_evidence',
  'independent_corroboration',
  'freshness_check',
  'entity_disambiguation',
  'contradiction_check',
  'background_context',
  'community_experience'
])

const FUSION_PATH_STATUSES = new Set([
  'succeeded',
  'empty',
  'failed',
  'cancelled'
])

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
        typeof candidate.content !== 'string' ||
        candidate.title.trim().length === 0 ||
        candidate.url.trim().length === 0 ||
        candidate.content.trim().length === 0
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
      const parsed = ModelRoleSchema.safeParse(role)
      if (!parsed.success) {
        throw new Error('Invalid production retrieval completed role.')
      }
      return parsed.data
    })
  )
}

function normalizeRetrievedAt(value: unknown): Date {
  let date: Date

  if (value instanceof Date) {
    date = new Date(value.getTime())
  } else if (typeof value === 'number' || typeof value === 'string') {
    if (typeof value === 'string' && value.trim().length === 0) {
      throw new Error('Invalid production retrieval timestamp.')
    }
    date = new Date(value)
  } else {
    throw new Error('Invalid production retrieval timestamp.')
  }

  if (!Number.isFinite(date.getTime())) {
    throw new Error('Invalid production retrieval timestamp.')
  }
  return date
}

function readSafeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  error: string
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new Error(error)
  }
  return value as number
}

function freezeFusionOutcome(value: unknown): FusionRetrievalPathOutcome {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid production Fusion path outcome.')
  }
  const candidate = value as Record<string, unknown>
  const sourceClass = SourceClassSchema.safeParse(candidate.sourceClass)
  if (
    typeof candidate.pathId !== 'string' ||
    !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(candidate.pathId) ||
    !sourceClass.success ||
    typeof candidate.purpose !== 'string' ||
    !FUSION_PATH_PURPOSES.has(candidate.purpose) ||
    typeof candidate.status !== 'string' ||
    !FUSION_PATH_STATUSES.has(candidate.status) ||
    (candidate.errorClass !== null &&
      (typeof candidate.errorClass !== 'string' ||
        candidate.errorClass.length > 128))
  ) {
    throw new Error('Invalid production Fusion path outcome.')
  }

  return Object.freeze({
    pathId: candidate.pathId,
    sourceClass: sourceClass.data,
    purpose: candidate.purpose as FusionRetrievalPathOutcome['purpose'],
    status: candidate.status as FusionRetrievalPathOutcome['status'],
    attempts: readSafeInteger(
      candidate.attempts,
      0,
      5,
      'Invalid production Fusion path attempts.'
    ),
    resultCount: readSafeInteger(
      candidate.resultCount,
      0,
      500,
      'Invalid production Fusion path result count.'
    ),
    errorClass: candidate.errorClass as string | null
  })
}

function freezeFusionReport(value: unknown): FusionRetrievalExecutionReport {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid production Fusion retrieval report.')
  }
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.routeDigest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(candidate.routeDigest) ||
    !Array.isArray(candidate.reasonCodes) ||
    candidate.reasonCodes.length > MAX_REASON_CODES ||
    candidate.reasonCodes.some(
      code =>
        typeof code !== 'string' ||
        code.length === 0 ||
        code.length > MAX_REASON_CODE_LENGTH
    ) ||
    !Array.isArray(candidate.outcomes) ||
    candidate.outcomes.length > MAX_FUSION_PATHS ||
    !candidate.budget ||
    typeof candidate.budget !== 'object'
  ) {
    throw new Error('Invalid production Fusion retrieval report.')
  }

  const budget = candidate.budget as Record<string, unknown>
  const outcomes = Object.freeze(candidate.outcomes.map(freezeFusionOutcome))
  if (new Set(outcomes.map(outcome => outcome.pathId)).size !== outcomes.length) {
    throw new Error('Invalid duplicate production Fusion path outcome.')
  }

  return Object.freeze({
    routeDigest: candidate.routeDigest,
    reasonCodes: Object.freeze([...new Set(candidate.reasonCodes)] as string[]),
    outcomes,
    budget: Object.freeze({
      toolCallsUsed: readSafeInteger(
        budget.toolCallsUsed,
        0,
        100,
        'Invalid production Fusion tool-call usage.'
      ),
      toolCallsAllowed: readSafeInteger(
        budget.toolCallsAllowed,
        1,
        100,
        'Invalid production Fusion tool-call allowance.'
      ),
      resultsReturned: readSafeInteger(
        budget.resultsReturned,
        0,
        500,
        'Invalid production Fusion result usage.'
      ),
      resultsAllowed: readSafeInteger(
        budget.resultsAllowed,
        1,
        500,
        'Invalid production Fusion result allowance.'
      )
    })
  })
}

function normalizeResult(value: unknown): GovernedRetrievalResult {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid production retrieval result.')
  }

  const candidate = value as Record<string, unknown>
  return Object.freeze({
    searchResults: freezeSearchResults(candidate.searchResults),
    completedRoles: freezeCompletedRoles(candidate.completedRoles),
    retrievedAt: normalizeRetrievedAt(candidate.retrievedAt),
    ...(candidate.fusion === undefined
      ? {}
      : { fusion: freezeFusionReport(candidate.fusion) })
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
      if (
        !Number.isSafeInteger(input.attempt) ||
        input.attempt < 1 ||
        input.attempt > 5
      ) {
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
