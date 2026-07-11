import type { EvidenceGraph } from '@/lib/ai-architecture/evidence'
import type { RouteExecutionContext } from '@/lib/ai/router/execution-context'
import type { ModelRole } from '@/lib/ai/schemas'
import type { SearchResultItem } from '@/lib/types'

import {
  evaluateLiveCoordinatorHandoff,
  type LiveCoordinatorHandoffResult
} from './live-handoff'

const MAX_REPAIR_ACTIONS = 32
const MAX_REPAIR_ACTION_LENGTH = 128

const ALLOWED_PRECOMPOSITION_ACTIONS = new Set([
  'retrieve_more_sources',
  'retrieve_required_source_classes',
  'retrieve_authoritative_sources',
  'retrieve_independent_sources',
  'retrieve_fresh_sources',
  'retrieve_disambiguating_sources',
  'run_retriever',
  'run_fusion_planner',
  'run_source_quality',
  'run_entity_grounding',
  'run_contradiction_review'
])

export type GovernedRetrievalResult = Readonly<{
  searchResults: readonly SearchResultItem[]
  completedRoles: readonly ModelRole[]
  retrievedAt: string | Date
}>

export type GovernedRetrievalAdapter = Readonly<{
  retrieve(input: Readonly<{
    query: string
    routeContext: RouteExecutionContext
    attempt: number
    repairActions: readonly string[]
    signal?: AbortSignal
  }>): Promise<GovernedRetrievalResult>
}>

export type GovernedCompositionAdapter<TOutput> = Readonly<{
  compose(input: Readonly<{
    query: string
    routeContext: RouteExecutionContext
    evidenceGraph: EvidenceGraph
    completedRoles: readonly ModelRole[]
    signal?: AbortSignal
  }>): Promise<TOutput>
}>

export type GovernedPipelineResult<TOutput> = Readonly<{
  output: TOutput
  handoff: LiveCoordinatorHandoffResult
  attempts: number
}>

export type GovernedPipelineInput<TOutput> = Readonly<{
  query: string
  routeContext: RouteExecutionContext
  retrieval: GovernedRetrievalAdapter
  composition: GovernedCompositionAdapter<TOutput>
  maxRetrievalAttempts?: number
  signal?: AbortSignal
  now?: Date
}>

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException('The operation was aborted.', 'AbortError')
  }
}

function sanitizeRepairActions(actions: readonly string[]): readonly string[] {
  if (!Array.isArray(actions) || actions.length > MAX_REPAIR_ACTIONS) {
    throw new Error('Invalid Coordinator repair action set.')
  }

  const sanitized = [...new Set(actions)].map(action => {
    if (
      typeof action !== 'string' ||
      action.length === 0 ||
      action.length > MAX_REPAIR_ACTION_LENGTH ||
      !ALLOWED_PRECOMPOSITION_ACTIONS.has(action)
    ) {
      throw new Error('Coordinator proposed an unsupported repair action.')
    }
    return action
  })

  return Object.freeze(sanitized)
}

function normalizeAttemptLimit(value: number | undefined): number {
  if (value === undefined) return 2
  if (!Number.isSafeInteger(value) || value < 1 || value > 5) {
    throw new Error('Invalid retrieval attempt limit.')
  }
  return value
}

export async function runGovernedResearchPipeline<TOutput>(
  input: GovernedPipelineInput<TOutput>
): Promise<GovernedPipelineResult<TOutput>> {
  const query = typeof input?.query === 'string' ? input.query.trim() : ''
  if (!query) {
    throw new Error('Invalid governed pipeline query.')
  }
  if (typeof input.retrieval?.retrieve !== 'function') {
    throw new Error('Invalid governed retrieval adapter.')
  }
  if (typeof input.composition?.compose !== 'function') {
    throw new Error('Invalid governed composition adapter.')
  }

  const maxRetrievalAttempts = normalizeAttemptLimit(input.maxRetrievalAttempts)
  let repairActions: readonly string[] = Object.freeze([])
  let lastHandoff: LiveCoordinatorHandoffResult | undefined

  for (let attempt = 1; attempt <= maxRetrievalAttempts; attempt += 1) {
    throwIfAborted(input.signal)

    const retrievalResult = await input.retrieval.retrieve({
      query,
      routeContext: input.routeContext,
      attempt,
      repairActions,
      signal: input.signal
    })

    throwIfAborted(input.signal)

    lastHandoff = evaluateLiveCoordinatorHandoff({
      routeContext: input.routeContext,
      query,
      searchResults: retrievalResult.searchResults,
      completedRoles: retrievalResult.completedRoles,
      retrievalAttempts: attempt,
      maxRetrievalAttempts,
      retrievedAt: retrievalResult.retrievedAt,
      now: input.now
    })

    if (lastHandoff.evaluation.repairPlan.canProceedToComposition) {
      throwIfAborted(input.signal)
      const output = await input.composition.compose({
        query,
        routeContext: lastHandoff.routeContext,
        evidenceGraph: lastHandoff.state.evidenceGraph,
        completedRoles: Object.freeze([...lastHandoff.state.completedRoles]),
        signal: input.signal
      })
      throwIfAborted(input.signal)

      return Object.freeze({ output, handoff: lastHandoff, attempts: attempt })
    }

    repairActions = sanitizeRepairActions(
      lastHandoff.evaluation.repairPlan.actions
    )
    if (repairActions.length === 0 || attempt === maxRetrievalAttempts) {
      break
    }
  }

  const actions = lastHandoff?.evaluation.repairPlan.actions ?? []
  throw new Error(
    actions.length > 0
      ? `Coordinator blocked composition; required repairs: ${actions.join(', ')}.`
      : 'Coordinator blocked composition.'
  )
}
