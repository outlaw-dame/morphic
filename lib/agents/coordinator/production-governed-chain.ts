import type { EvidenceGraph } from '@/lib/ai-architecture/evidence'
import {
  createRouteExecutionContext,
  type RouteExecutionContext
} from '@/lib/ai/router/execution-context'

import {
  runGovernedResearchPipeline,
  type CoordinatorCompositionApproval,
  type GovernedCompositionAdapter,
  type GovernedRetrievalAdapter
} from './governed-pipeline'
import type {
  PendingAdvisorReview,
  ProductionAdvisorReviewInput
} from './production-advisor-adapter'
import type {
  PendingCitationVerification,
  ProductionCitationVerificationInput
} from './production-citation-verifier-adapter'
import type { PendingCompositionDraft } from './production-composition-adapter'
import {
  authorizeProductionRelease,
  consumeProductionReleaseAuthorization,
  type ReleasedProductionResponse
} from './production-release-gate'

const MAX_QUERY_LENGTH = 16_000

export type ProductionCompositionPort = GovernedCompositionAdapter<PendingCompositionDraft>

export type ProductionAdvisorPort = Readonly<{
  review(input: ProductionAdvisorReviewInput): Promise<PendingAdvisorReview>
}>

export type ProductionCitationVerifierPort = Readonly<{
  verify(
    input: ProductionCitationVerificationInput
  ): Promise<PendingCitationVerification>
}>

export type ProductionGovernedChainInput = Readonly<{
  query: string
  routeContext: RouteExecutionContext
  retrieval: GovernedRetrievalAdapter
  composition: ProductionCompositionPort
  advisor?: ProductionAdvisorPort
  citationVerifier: ProductionCitationVerifierPort
  maxRetrievalAttempts?: number
  signal?: AbortSignal
  now?: Date
  authorizationTtlMs?: number
}>

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  const message =
    typeof signal.reason === 'string'
      ? signal.reason
      : 'The governed production chain was aborted.'
  throw typeof DOMException !== 'undefined'
    ? new DOMException(message, 'AbortError')
    : new Error(message)
}

export async function runProductionGovernedChain(
  input: ProductionGovernedChainInput
): Promise<ReleasedProductionResponse> {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid governed production chain input.')
  }
  const query = typeof input.query === 'string' ? input.query.trim() : ''
  if (!query || query.length > MAX_QUERY_LENGTH) {
    throw new Error('Invalid governed production chain query.')
  }
  if (typeof input.retrieval?.retrieve !== 'function') {
    throw new Error('Invalid governed production retrieval port.')
  }
  if (typeof input.composition?.compose !== 'function') {
    throw new Error('Invalid governed production composition port.')
  }
  if (typeof input.citationVerifier?.verify !== 'function') {
    throw new Error('Invalid governed production Citation Verifier port.')
  }

  const routeContext = createRouteExecutionContext(input.routeContext)
  if (!routeContext.routePlan.requiresResearch) {
    throw new Error('Governed production chain requires a research route.')
  }
  if (
    routeContext.routePlan.needsAdvisorReview &&
    typeof input.advisor?.review !== 'function'
  ) {
    throw new Error('Governed production chain is missing the required Advisor port.')
  }

  throwIfAborted(input.signal)

  let approval: CoordinatorCompositionApproval | undefined
  let approvedRouteContext: RouteExecutionContext | undefined
  let evidenceGraph: EvidenceGraph | undefined

  const pipeline = await runGovernedResearchPipeline({
    query,
    routeContext,
    retrieval: input.retrieval,
    composition: {
      async compose(compositionInput) {
        approval = compositionInput.approval
        approvedRouteContext = compositionInput.routeContext
        evidenceGraph = compositionInput.evidenceGraph
        return input.composition.compose(compositionInput)
      }
    },
    ...(input.maxRetrievalAttempts === undefined
      ? {}
      : { maxRetrievalAttempts: input.maxRetrievalAttempts }),
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.now ? { now: input.now } : {})
  })

  if (!approval || !approvedRouteContext || !evidenceGraph) {
    throw new Error('Governed production chain did not capture approved composition state.')
  }

  throwIfAborted(input.signal)

  const advisorReview = routeContext.routePlan.needsAdvisorReview
    ? await input.advisor!.review({
        query,
        routeContext: approvedRouteContext,
        evidenceGraph,
        approval,
        composition: pipeline.output,
        ...(input.signal ? { signal: input.signal } : {})
      })
    : undefined

  throwIfAborted(input.signal)

  const citationVerification = await input.citationVerifier.verify({
    query,
    routeContext: approvedRouteContext,
    evidenceGraph,
    approval,
    composition: pipeline.output,
    ...(advisorReview ? { advisorReview } : {}),
    ...(input.signal ? { signal: input.signal } : {})
  })

  throwIfAborted(input.signal)

  const authorization = authorizeProductionRelease({
    routeContext: approvedRouteContext,
    evidenceGraph,
    approval,
    composition: pipeline.output,
    ...(advisorReview ? { advisorReview } : {}),
    citationVerification,
    ...(input.now ? { now: input.now } : {}),
    ...(input.authorizationTtlMs === undefined
      ? {}
      : { authorizationTtlMs: input.authorizationTtlMs })
  })

  return consumeProductionReleaseAuthorization(authorization, {
    routeContext: approvedRouteContext,
    ...(input.now ? { now: input.now } : {})
  })
}
