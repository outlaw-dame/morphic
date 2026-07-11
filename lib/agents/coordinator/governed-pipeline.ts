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

const ALLOWED_RETRIEVAL_REPAIR_ACTIONS = new Set([
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

const KNOWN_NON_RETRIEVAL_ACTIONS = new Set([
  'escalate_to_advisor',
  'run_advisor_review',
  'run_citation_verifier',
  'select_stronger_model'
])

const compositionApprovals = new WeakSet<object>()

export type CoordinatorCompositionApproval = Readonly<{
  routeDigest: string
  evidenceGraph: EvidenceGraph
}>

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
    approval: CoordinatorCompositionApproval
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

function createCoordinatorCompositionApproval(
  routeContext: RouteExecutionContext,
  evidenceGraph: EvidenceGraph
): CoordinatorCompositionApproval {
  const approval = Object.freeze({
    routeDigest: routeContext.routeDigest,
    evidenceGraph
  })
  compositionApprovals.add(approval)
  return approval
}

export function assertCoordinatorCompositionApproval(
  approval: CoordinatorCompositionApproval,
  routeContext: RouteExecutionContext,
  evidenceGraph: EvidenceGraph
): void {
  if (
    !approval ||
    typeof approval !== 'object' ||
    !compositionApprovals.has(approval) ||
    approval.routeDigest !== routeContext.routeDigest ||
    approval.evidenceGraph !== evidenceGraph
  ) {
    throw new Error('Invalid Coordinator composition approval.')
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return

  if (signal.reason instanceof Error) {
    throw signal.reason
  }

  const message =
    typeof signal.reason === 'string'
      ? signal.reason
      : 'The operation was aborted.'

  throw typeof DOMException !== 'undefined'
    ? new DOMException(message, 'AbortError')
    : new Error(message)
}

function selectRetrievalRepairActions(
  actions: readonly string[]
): readonly string[] {
  if (!Array.isArray(actions) || actions.length > MAX_REPAIR_ACTIONS) {
    throw new Error('Invalid Coordinator repair action set.')
  }

  const retrievalActions: string[] = []
  for (const action of new Set(actions)) {
    if (
      typeof action !== 'string' ||
      action.length === 0 ||
      action.length > MAX_REPAIR_ACTION_LENGTH
    ) {
      throw new Error('Coordinator proposed an invalid repair action.')
    }

    if (ALLOWED_RETRIEVAL_REPAIR_ACTIONS.has(action)) {
      retrievalActions.push(action)
      continue
    }

    if (!KNOWN_NON_RETRIEVAL_ACTIONS.has(action)) {
      throw new Error('Coordinator proposed an unsupported repair action.')
    }
  }

  return Object.freeze(retrievalActions)
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

    if (!retrievalResult || typeof retrievalResult !== 'object') {
      throw new Error('Invalid retrieval result returned from adapter.')
    }

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

    const proposedRepairs = lastHandoff.evaluation.repairPlan.actions
    const canProceed =
      lastHandoff.evaluation.repairPlan.canProceedToComposition

    if (proposedRepairs.length > 0 && attempt < maxRetrievalAttempts) {
      repairActions = selectRetrievalRepairActions(proposedRepairs)
      if (repairActions.length > 0) {
        continue
      }
    }

    if (canProceed) {
      throwIfAborted(input.signal)
      const approval = createCoordinatorCompositionApproval(
        lastHandoff.routeContext,
        lastHandoff.state.evidenceGraph
      )
      const output = await input.composition.compose({
        query,
        routeContext: lastHandoff.routeContext,
        evidenceGraph: lastHandoff.state.evidenceGraph,
        completedRoles: Object.freeze([...lastHandoff.state.completedRoles]),
        approval,
        signal: input.signal
      })
      throwIfAborted(input.signal)

      return Object.freeze({ output, handoff: lastHandoff, attempts: attempt })
    }

    break
  }

  const actions = lastHandoff?.evaluation.repairPlan.actions ?? []
  throw new Error(
    actions.length > 0
      ? `Coordinator blocked composition; required repairs: ${actions.join(', ')}.`
      : 'Coordinator blocked composition.'
  )
}
