import { createHash } from 'node:crypto'
import { z } from 'zod'

import type { EvidenceGraph } from '@/lib/ai-architecture/evidence'
import {
  createRouteExecutionContext,
  type RouteExecutionContext
} from '@/lib/ai/router/execution-context'
import {
  runRole,
  type RoleProviderAdapter,
  type RoleRunnerLimits,
  type RoleRunnerOutcome,
  type TrustedRoleExecutionScope
} from '@/lib/ai/role-runner'

import {
  assertCoordinatorCompositionApproval,
  type CoordinatorCompositionApproval
} from './governed-pipeline'
import {
  assertProductionAdvisorReviewBinding,
  type PendingAdvisorReview
} from './production-advisor-adapter'
import type { PendingCompositionDraft } from './production-composition-adapter'

const MAX_QUERY_LENGTH = 16_000
const MAX_EVIDENCE_ITEMS = 500
const MAX_REFERENCED_IDS = 500
const MAX_REASON_CODES = 8

const CITATION_REASON_CODES = [
  'citations_verified',
  'citation_missing_support',
  'citation_partial_support',
  'citation_conflict_unresolved',
  'citation_missing_for_claim',
  'citation_low_confidence_source'
] as const

type CitationReasonCode = (typeof CITATION_REASON_CODES)[number]
const CitationReasonCodeSchema = z.enum(CITATION_REASON_CODES)

const citationVerificationBindings = new WeakMap<
  object,
  Readonly<{
    routeDigest: string
    composerOutputDigest: string
    advisorOutputDigest: string | null
    evidenceGraph: EvidenceGraph
  }>
>()

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested)
  }
  return Object.freeze(value)
}

function throwCancellation(signal?: AbortSignal): never {
  if (signal?.reason instanceof Error) throw signal.reason
  const message =
    typeof signal?.reason === 'string'
      ? signal.reason
      : 'The Citation Verifier operation was aborted.'
  throw typeof DOMException !== 'undefined'
    ? new DOMException(message, 'AbortError')
    : new Error(message)
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function assertCompositionIntegrity(composition: PendingCompositionDraft): string {
  if (!composition || typeof composition !== 'object') {
    throw new Error('Invalid pending composition draft.')
  }
  const result = composition.roleExecution
  if (
    composition.releaseStatus !== 'pending_advisor_and_citation_verifier' ||
    typeof composition.draft !== 'string' ||
    composition.draft.length === 0 ||
    !Array.isArray(composition.citedEvidenceIds) ||
    !result ||
    result.role !== 'answer_composer' ||
    result.status !== 'succeeded' ||
    result.failureClass !== null ||
    typeof result.outputDigest !== 'string'
  ) {
    throw new Error('Invalid pending composition draft.')
  }

  const outputDigest = digest({
    draft: composition.draft,
    citedEvidenceIds: [...composition.citedEvidenceIds]
  })
  if (outputDigest !== result.outputDigest) {
    throw new Error('Composer output digest mismatch.')
  }
  return outputDigest
}

function assertAdvisorIntegrity(
  review: PendingAdvisorReview | undefined,
  routeContext: RouteExecutionContext,
  evidenceGraph: EvidenceGraph,
  composerOutputDigest: string
): string | null {
  if (!routeContext.routePlan.needsAdvisorReview) {
    if (review !== undefined) {
      throw new Error('Unexpected Advisor review for this route.')
    }
    return null
  }
  if (!review || typeof review !== 'object') {
    throw new Error('Missing required Advisor review.')
  }
  return assertProductionAdvisorReviewBinding(
    review,
    routeContext,
    evidenceGraph,
    composerOutputDigest
  )
}

const CitationEvidenceSchema = z
  .object({
    id: z.string().min(1).max(256),
    url: z.string().url().max(4096),
    title: z.string().min(1).max(2048),
    summary: z.string().min(1).max(100_000),
    sourceClass: z.string().min(1).max(128),
    evidenceRole: z.string().min(1).max(128),
    claimIds: z.array(z.string().min(1).max(256)).max(2048),
    confidence: z.number().finite().min(0).max(1)
  })
  .strict()

const CitationVerifierInputSchema = z
  .object({
    query: z.string().min(1).max(MAX_QUERY_LENGTH),
    routeDigest: z.string().regex(/^[a-f0-9]{64}$/),
    composerOutputDigest: z.string().regex(/^[a-f0-9]{64}$/),
    advisorOutputDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    draft: z.string().min(1).max(200_000),
    citedEvidenceIds: z
      .array(z.string().min(1).max(256))
      .min(1)
      .max(MAX_REFERENCED_IDS),
    citedEvidence: z
      .array(CitationEvidenceSchema)
      .min(1)
      .max(MAX_EVIDENCE_ITEMS),
    warnings: z.array(z.string().min(1).max(2048)).max(256),
    conflicts: z
      .array(
        z
          .object({
            id: z.string().min(1).max(256),
            severity: z.enum(['info', 'warn', 'block']),
            reason: z.string().min(1).max(4096),
            evidenceIds: z
              .array(z.string().min(1).max(256))
              .max(MAX_REFERENCED_IDS)
          })
          .strict()
      )
      .max(MAX_EVIDENCE_ITEMS)
  })
  .strict()
  .transform(value => deepFreeze(value))

const CitationVerifierOutputSchema = z
  .object({
    decision: z.enum(['verified', 'repair', 'block']),
    reasonCodes: z
      .array(CitationReasonCodeSchema)
      .max(MAX_REASON_CODES)
      .transform(values => [...new Set(values)]),
    verifiedEvidenceIds: z
      .array(z.string().min(1).max(256))
      .max(MAX_REFERENCED_IDS)
      .transform(values => [...new Set(values)]),
    unsupportedEvidenceIds: z
      .array(z.string().min(1).max(256))
      .max(MAX_REFERENCED_IDS)
      .transform(values => [...new Set(values)]),
    missingCitationClaimIds: z
      .array(z.string().min(1).max(256))
      .max(MAX_REFERENCED_IDS)
      .transform(values => [...new Set(values)]),
    confidence: z.number().finite().min(0).max(1)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decision === 'verified') {
      if (
        value.reasonCodes.length !== 1 ||
        value.reasonCodes[0] !== 'citations_verified' ||
        value.verifiedEvidenceIds.length === 0 ||
        value.unsupportedEvidenceIds.length > 0 ||
        value.missingCitationClaimIds.length > 0
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Verified citation output must verify evidence, contain only citations_verified, and have no unresolved IDs.'
        })
      }
      return
    }
    if (value.reasonCodes.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'Non-verified citation output requires a reason code.'
      })
    }
  })

export type CitationVerifierModelInput = z.infer<
  typeof CitationVerifierInputSchema
>
export type CitationVerifierModelOutput = z.infer<
  typeof CitationVerifierOutputSchema
>

export type PendingCitationVerification = Readonly<{
  decision: CitationVerifierModelOutput['decision']
  reasonCodes: readonly CitationReasonCode[]
  verifiedEvidenceIds: readonly string[]
  unsupportedEvidenceIds: readonly string[]
  missingCitationClaimIds: readonly string[]
  confidence: number
  routeDigest: string
  composerOutputDigest: string
  advisorOutputDigest: string | null
  releaseStatus: 'pending_final_deterministic_release'
  roleExecution: RoleRunnerOutcome<CitationVerifierModelOutput>['result']
}>

export type ProductionCitationVerifierOptions = Readonly<{
  scope: TrustedRoleExecutionScope
  candidates: readonly unknown[]
  provider: RoleProviderAdapter<CitationVerifierModelInput>
  limits?: RoleRunnerLimits
}>

export type ProductionCitationVerificationInput = Readonly<{
  query: string
  routeContext: RouteExecutionContext
  evidenceGraph: EvidenceGraph
  approval: CoordinatorCompositionApproval
  composition: PendingCompositionDraft
  advisorReview?: PendingAdvisorReview
  signal?: AbortSignal
}>

const DEFAULT_LIMITS: RoleRunnerLimits = Object.freeze({
  maxInputBytes: 2_000_000,
  maxOutputBytes: 64_000,
  maxOutputTokens: 4_000
})

const CITATION_VERIFIER_PROMPT = Object.freeze({
  version: 'citation-verifier-evidence-only-v1',
  instruction: [
    'Verify the pending draft citations only against the supplied cited evidence.',
    'Do not browse, retrieve, call tools, add evidence, rewrite the draft, or approve release.',
    'Mark a citation verified only when its supplied evidence supports the draft use.',
    'Reference only evidence and claim IDs present in the input.',
    'Return only the strict structured verification decision.'
  ].join(' '),
  inputSchemaVersion: 1,
  outputSchemaVersion: 1
})

function buildVerifierInput(
  query: string,
  routeContext: RouteExecutionContext,
  evidenceGraph: EvidenceGraph,
  composition: PendingCompositionDraft,
  composerOutputDigest: string,
  advisorOutputDigest: string | null
): CitationVerifierModelInput {
  if (composition.citedEvidenceIds.length === 0) {
    throw new Error('Citation verification requires at least one cited evidence item.')
  }

  const cited = new Set(composition.citedEvidenceIds)
  const citedEvidence = evidenceGraph.items.filter(item => cited.has(item.id))
  if (citedEvidence.length !== cited.size) {
    throw new Error('Composition cites evidence outside the approved graph.')
  }

  const candidate = {
    query,
    routeDigest: routeContext.routeDigest,
    composerOutputDigest,
    advisorOutputDigest,
    draft: composition.draft,
    citedEvidenceIds: [...composition.citedEvidenceIds],
    citedEvidence: citedEvidence.map(item => ({
      id: item.id,
      url: item.url,
      title: item.title,
      summary: item.summary,
      sourceClass: item.sourceClass,
      evidenceRole: item.evidenceRole,
      claimIds: [...item.claimIds],
      confidence: item.confidence
    })),
    warnings: [...evidenceGraph.warnings],
    conflicts: evidenceGraph.conflicts.map(conflict => ({
      id: conflict.id,
      severity: conflict.severity,
      reason: conflict.reason,
      evidenceIds: [...conflict.evidenceIds]
    }))
  }
  const parsed = CitationVerifierInputSchema.safeParse(candidate)
  if (!parsed.success) {
    throw new Error('Invalid Citation Verifier input.')
  }
  return parsed.data
}

function validateOutputReferences(
  output: CitationVerifierModelOutput,
  input: CitationVerifierModelInput
): void {
  const evidenceIds = new Set(input.citedEvidenceIds)
  const claimIds = new Set(input.citedEvidence.flatMap(item => item.claimIds))
  if (
    output.verifiedEvidenceIds.some(id => !evidenceIds.has(id)) ||
    output.unsupportedEvidenceIds.some(id => !evidenceIds.has(id))
  ) {
    throw new Error('Citation Verifier referenced evidence outside the cited set.')
  }
  if (output.missingCitationClaimIds.some(id => !claimIds.has(id))) {
    throw new Error(
      'Citation Verifier referenced claims outside the cited evidence.'
    )
  }
  if (output.decision === 'verified') {
    const verified = new Set(output.verifiedEvidenceIds)
    if (
      input.citedEvidenceIds.length === 0 ||
      input.citedEvidenceIds.some(id => !verified.has(id))
    ) {
      throw new Error(
        'Citation Verifier did not verify every cited evidence item.'
      )
    }
  }
}

export function assertProductionCitationVerificationBinding(
  verification: PendingCitationVerification,
  routeContext: RouteExecutionContext,
  evidenceGraph: EvidenceGraph,
  composition: PendingCompositionDraft,
  advisorReview?: PendingAdvisorReview
): string {
  if (!verification || typeof verification !== 'object') {
    throw new Error('Invalid production Citation Verification.')
  }
  const composerOutputDigest = assertCompositionIntegrity(composition)
  const advisorOutputDigest = assertAdvisorIntegrity(
    advisorReview,
    routeContext,
    evidenceGraph,
    composerOutputDigest
  )
  const binding = citationVerificationBindings.get(verification)
  const result = verification.roleExecution
  if (
    !binding ||
    binding.routeDigest !== routeContext.routeDigest ||
    binding.composerOutputDigest !== composerOutputDigest ||
    binding.advisorOutputDigest !== advisorOutputDigest ||
    binding.evidenceGraph !== evidenceGraph ||
    verification.routeDigest !== routeContext.routeDigest ||
    verification.composerOutputDigest !== composerOutputDigest ||
    verification.advisorOutputDigest !== advisorOutputDigest ||
    verification.releaseStatus !== 'pending_final_deterministic_release' ||
    verification.decision !== 'verified' ||
    verification.reasonCodes.length !== 1 ||
    verification.reasonCodes[0] !== 'citations_verified' ||
    verification.verifiedEvidenceIds.length === 0 ||
    verification.unsupportedEvidenceIds.length !== 0 ||
    verification.missingCitationClaimIds.length !== 0 ||
    !result ||
    result.role !== 'citation_verifier' ||
    result.status !== 'succeeded' ||
    result.failureClass !== null ||
    typeof result.outputDigest !== 'string'
  ) {
    throw new Error('Citation Verification did not approve this composition.')
  }

  const cited = new Set(composition.citedEvidenceIds)
  const verified = new Set(verification.verifiedEvidenceIds)
  if (
    cited.size === 0 ||
    cited.size !== verified.size ||
    [...cited].some(id => !verified.has(id))
  ) {
    throw new Error('Citation Verification does not cover every citation.')
  }

  const outputDigest = digest({
    decision: verification.decision,
    reasonCodes: [...verification.reasonCodes],
    verifiedEvidenceIds: [...verification.verifiedEvidenceIds],
    unsupportedEvidenceIds: [...verification.unsupportedEvidenceIds],
    missingCitationClaimIds: [...verification.missingCitationClaimIds],
    confidence: verification.confidence
  })
  if (outputDigest !== result.outputDigest) {
    throw new Error('Citation Verifier output digest mismatch.')
  }
  return outputDigest
}

export function createProductionCitationVerifierAdapter(
  options: ProductionCitationVerifierOptions
): Readonly<{
  verify(
    input: ProductionCitationVerificationInput
  ): Promise<PendingCitationVerification>
}> {
  if (!options || typeof options !== 'object') {
    throw new Error('Invalid production Citation Verifier configuration.')
  }

  return Object.freeze({
    async verify(input) {
      if (!input || typeof input !== 'object') {
        throw new Error('Invalid production Citation Verifier input.')
      }
      const query = typeof input.query === 'string' ? input.query.trim() : ''
      if (!query || query.length > MAX_QUERY_LENGTH) {
        throw new Error('Invalid production Citation Verifier query.')
      }

      const routeContext = createRouteExecutionContext(input.routeContext)
      assertCoordinatorCompositionApproval(
        input.approval,
        routeContext,
        input.evidenceGraph
      )
      if (
        !routeContext.routePlan.requiredModelRoles.includes(
          'citation_verifier'
        )
      ) {
        throw new Error('Router did not authorize Citation Verifier execution.')
      }

      const composerOutputDigest = assertCompositionIntegrity(input.composition)
      const advisorOutputDigest = assertAdvisorIntegrity(
        input.advisorReview,
        routeContext,
        input.evidenceGraph,
        composerOutputDigest
      )
      const verifierInput = buildVerifierInput(
        query,
        routeContext,
        input.evidenceGraph,
        input.composition,
        composerOutputDigest,
        advisorOutputDigest
      )

      const outcome = await runRole({
        scope: options.scope,
        role: 'citation_verifier',
        candidates: options.candidates,
        prompt: CITATION_VERIFIER_PROMPT,
        inputSchema: CitationVerifierInputSchema,
        outputSchema: CitationVerifierOutputSchema,
        input: verifierInput,
        adapter: options.provider,
        limits: options.limits ?? DEFAULT_LIMITS,
        retryPolicy: {
          maxAttempts: 1,
          initialDelayMs: 100,
          maximumDelayMs: 100,
          idempotent: false
        },
        signal: input.signal
      })

      if (
        outcome.result.status === 'cancelled' ||
        outcome.result.failureClass === 'cancelled'
      ) {
        throwCancellation(input.signal)
      }
      if (outcome.result.status !== 'succeeded' || outcome.output === null) {
        throw new Error(
          `Citation Verifier execution failed: ${outcome.result.failureClass ?? 'unknown'}.`
        )
      }

      validateOutputReferences(outcome.output, verifierInput)
      const verification = Object.freeze({
        decision: outcome.output.decision,
        reasonCodes: Object.freeze([...outcome.output.reasonCodes]),
        verifiedEvidenceIds: Object.freeze([
          ...outcome.output.verifiedEvidenceIds
        ]),
        unsupportedEvidenceIds: Object.freeze([
          ...outcome.output.unsupportedEvidenceIds
        ]),
        missingCitationClaimIds: Object.freeze([
          ...outcome.output.missingCitationClaimIds
        ]),
        confidence: outcome.output.confidence,
        routeDigest: routeContext.routeDigest,
        composerOutputDigest,
        advisorOutputDigest,
        releaseStatus: 'pending_final_deterministic_release' as const,
        roleExecution: outcome.result
      })
      citationVerificationBindings.set(
        verification,
        Object.freeze({
          routeDigest: routeContext.routeDigest,
          composerOutputDigest,
          advisorOutputDigest,
          evidenceGraph: input.evidenceGraph
        })
      )
      return verification
    }
  })
}
