import type { EvidenceGraph } from '@/lib/ai-architecture/evidence'
import {
  createRouteExecutionContext,
  type RouteExecutionContext
} from '@/lib/ai/router/execution-context'

import {
  assertCoordinatorCompositionApproval,
  type CoordinatorCompositionApproval
} from './governed-pipeline'
import type { PendingAdvisorReview } from './production-advisor-adapter'
import {
  assertProductionCitationVerificationBinding,
  type PendingCitationVerification
} from './production-citation-verifier-adapter'
import type { PendingCompositionDraft } from './production-composition-adapter'

const DEFAULT_AUTHORIZATION_TTL_MS = 60_000
const MIN_AUTHORIZATION_TTL_MS = 1_000
const MAX_AUTHORIZATION_TTL_MS = 120_000
const MAX_CLOCK_SKEW_MS = 30_000

export type ProductionReleaseInput = Readonly<{
  routeContext: RouteExecutionContext
  evidenceGraph: EvidenceGraph
  approval: CoordinatorCompositionApproval
  composition: PendingCompositionDraft
  advisorReview?: PendingAdvisorReview
  citationVerification: PendingCitationVerification
  now?: Date
  authorizationTtlMs?: number
}>

export type ProductionReleaseAuthorization = Readonly<{
  status: 'authorized_for_streaming'
  routeDigest: string
  executionId: string
  draft: string
  citedEvidenceIds: readonly string[]
  composerOutputDigest: string
  advisorOutputDigest: string | null
  citationVerifierOutputDigest: string
  issuedAt: string
  expiresAt: string
}>

export type ReleasedProductionResponse = Readonly<{
  status: 'released'
  routeDigest: string
  executionId: string
  draft: string
  citedEvidenceIds: readonly string[]
  composerOutputDigest: string
  advisorOutputDigest: string | null
  citationVerifierOutputDigest: string
  releasedAt: string
}>

type ReleaseBinding = Readonly<{
  routeContext: RouteExecutionContext
  evidenceGraph: EvidenceGraph
  composition: PendingCompositionDraft
  advisorReview?: PendingAdvisorReview
  citationVerification: PendingCitationVerification
  expiresAtMs: number
}>

const releaseBindings = new WeakMap<object, ReleaseBinding>()
const consumedAuthorizations = new WeakSet<object>()

function readNow(value?: Date): Date {
  const now = value === undefined ? new Date() : new Date(value.getTime())
  if (!Number.isFinite(now.getTime())) {
    throw new Error('Invalid deterministic release time.')
  }
  return now
}

function readTtl(value?: number): number {
  const ttl = value ?? DEFAULT_AUTHORIZATION_TTL_MS
  if (
    !Number.isSafeInteger(ttl) ||
    ttl < MIN_AUTHORIZATION_TTL_MS ||
    ttl > MAX_AUTHORIZATION_TTL_MS
  ) {
    throw new Error('Invalid deterministic release authorization TTL.')
  }
  return ttl
}

function assertSuccessfulRoleExecution(
  value: unknown,
  expectedRole: 'answer_composer' | 'advisor' | 'citation_verifier'
): Readonly<{
  executionId: string
  completedAt: string
  outputDigest: string
}> {
  if (!value || typeof value !== 'object') {
    throw new Error(`Invalid ${expectedRole} execution result.`)
  }
  const candidate = value as Record<string, unknown>
  if (
    candidate.role !== expectedRole ||
    candidate.status !== 'succeeded' ||
    candidate.failureClass !== null ||
    typeof candidate.executionId !== 'string' ||
    candidate.executionId.length === 0 ||
    typeof candidate.completedAt !== 'string' ||
    typeof candidate.outputDigest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(candidate.outputDigest)
  ) {
    throw new Error(`Invalid ${expectedRole} execution result.`)
  }
  const completedAtMs = Date.parse(candidate.completedAt)
  if (!Number.isFinite(completedAtMs)) {
    throw new Error(`Invalid ${expectedRole} completion time.`)
  }
  return Object.freeze({
    executionId: candidate.executionId,
    completedAt: candidate.completedAt,
    outputDigest: candidate.outputDigest
  })
}

function assertExecutionChain(
  input: ProductionReleaseInput,
  now: Date
): string {
  const composer = assertSuccessfulRoleExecution(
    input.composition.roleExecution,
    'answer_composer'
  )
  const citation = assertSuccessfulRoleExecution(
    input.citationVerification.roleExecution,
    'citation_verifier'
  )
  const executions = [composer.executionId, citation.executionId]
  const completions = [composer.completedAt, citation.completedAt]

  if (input.routeContext.routePlan.needsAdvisorReview) {
    const advisor = assertSuccessfulRoleExecution(
      input.advisorReview?.roleExecution,
      'advisor'
    )
    executions.push(advisor.executionId)
    completions.push(advisor.completedAt)
  }

  if (new Set(executions).size !== 1) {
    throw new Error('Release role executions do not share one execution ID.')
  }

  const nowMs = now.getTime()
  for (const completedAt of completions) {
    const completedAtMs = Date.parse(completedAt)
    if (completedAtMs > nowMs + MAX_CLOCK_SKEW_MS) {
      throw new Error('Release role completion time is in the future.')
    }
  }
  return executions[0]!
}

export function authorizeProductionRelease(
  input: ProductionReleaseInput
): ProductionReleaseAuthorization {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid deterministic release input.')
  }

  const now = readNow(input.now)
  const ttl = readTtl(input.authorizationTtlMs)
  const routeContext = createRouteExecutionContext(input.routeContext)
  assertCoordinatorCompositionApproval(
    input.approval,
    routeContext,
    input.evidenceGraph
  )

  if (!routeContext.routePlan.requiredModelRoles.includes('answer_composer')) {
    throw new Error('Router did not authorize answer composition.')
  }
  if (
    !routeContext.routePlan.needsCitationVerification ||
    !routeContext.routePlan.requiredModelRoles.includes('citation_verifier')
  ) {
    throw new Error(
      'Deterministic production release requires route-mandated citation verification.'
    )
  }

  const citationVerifierOutputDigest =
    assertProductionCitationVerificationBinding(
      input.citationVerification,
      routeContext,
      input.evidenceGraph,
      input.composition,
      input.advisorReview
    )
  const executionId = assertExecutionChain(
    { ...input, routeContext },
    now
  )
  const expiresAtMs = now.getTime() + ttl

  const authorization = Object.freeze({
    status: 'authorized_for_streaming' as const,
    routeDigest: routeContext.routeDigest,
    executionId,
    draft: input.composition.draft,
    citedEvidenceIds: Object.freeze([
      ...input.composition.citedEvidenceIds
    ]),
    composerOutputDigest: input.citationVerification.composerOutputDigest,
    advisorOutputDigest: input.citationVerification.advisorOutputDigest,
    citationVerifierOutputDigest,
    issuedAt: now.toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString()
  })

  releaseBindings.set(
    authorization,
    Object.freeze({
      routeContext,
      evidenceGraph: input.evidenceGraph,
      composition: input.composition,
      ...(input.advisorReview
        ? { advisorReview: input.advisorReview }
        : {}),
      citationVerification: input.citationVerification,
      expiresAtMs
    })
  )
  return authorization
}

export function consumeProductionReleaseAuthorization(
  authorization: ProductionReleaseAuthorization,
  options: Readonly<{
    routeContext: RouteExecutionContext
    now?: Date
  }>
): ReleasedProductionResponse {
  if (!authorization || typeof authorization !== 'object') {
    throw new Error('Invalid production release authorization.')
  }
  if (!options || typeof options !== 'object') {
    throw new Error('Invalid production release consumption input.')
  }

  const binding = releaseBindings.get(authorization)
  if (!binding || consumedAuthorizations.has(authorization)) {
    throw new Error('Invalid or already consumed production release authorization.')
  }
  const routeContext = createRouteExecutionContext(options.routeContext)
  if (
    binding.routeContext.routeDigest !== routeContext.routeDigest ||
    authorization.routeDigest !== routeContext.routeDigest
  ) {
    throw new Error('Production release route mismatch.')
  }

  const now = readNow(options.now)
  if (now.getTime() > binding.expiresAtMs) {
    consumedAuthorizations.add(authorization)
    throw new Error('Production release authorization expired.')
  }

  const currentCitationDigest = assertProductionCitationVerificationBinding(
    binding.citationVerification,
    binding.routeContext,
    binding.evidenceGraph,
    binding.composition,
    binding.advisorReview
  )
  if (
    currentCitationDigest !== authorization.citationVerifierOutputDigest ||
    authorization.draft !== binding.composition.draft ||
    authorization.composerOutputDigest !==
      binding.citationVerification.composerOutputDigest ||
    authorization.advisorOutputDigest !==
      binding.citationVerification.advisorOutputDigest
  ) {
    throw new Error('Production release authorization integrity mismatch.')
  }

  consumedAuthorizations.add(authorization)
  return Object.freeze({
    status: 'released' as const,
    routeDigest: authorization.routeDigest,
    executionId: authorization.executionId,
    draft: authorization.draft,
    citedEvidenceIds: Object.freeze([...authorization.citedEvidenceIds]),
    composerOutputDigest: authorization.composerOutputDigest,
    advisorOutputDigest: authorization.advisorOutputDigest,
    citationVerifierOutputDigest: authorization.citationVerifierOutputDigest,
    releasedAt: now.toISOString()
  })
}
