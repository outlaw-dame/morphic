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
import type { PendingCompositionDraft } from './production-composition-adapter'

const MAX_QUERY_LENGTH = 16_000
const MAX_EVIDENCE_ITEMS = 500
const MAX_REASON_CODES = 8
const MAX_REFERENCED_IDS = 500

const ADVISOR_REASON_CODES = [
  'advisor_ready',
  'advisor_insufficient_evidence',
  'advisor_unsupported_claim',
  'advisor_citation_risk',
  'advisor_conflict_unresolved',
  'advisor_high_risk_caveat_required'
] as const

type AdvisorReasonCode = (typeof ADVISOR_REASON_CODES)[number]
const AdvisorReasonCodeSchema = z.enum(ADVISOR_REASON_CODES)

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
      : 'The Advisor operation was aborted.'
  throw typeof DOMException !== 'undefined'
    ? new DOMException(message, 'AbortError')
    : new Error(message)
}

const AdvisorEvidenceSchema = z
  .object({
    id: z.string().min(1).max(256),
    title: z.string().min(1).max(2048),
    summary: z.string().min(1).max(100_000),
    sourceClass: z.string().min(1).max(128),
    evidenceRole: z.string().min(1).max(128),
    claimIds: z.array(z.string().min(1).max(256)).max(2048),
    confidence: z.number().finite().min(0).max(1)
  })
  .strict()

const AdvisorInputSchema = z
  .object({
    query: z.string().min(1).max(MAX_QUERY_LENGTH),
    routeDigest: z.string().regex(/^[a-f0-9]{64}$/),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    requiredSourceClasses: z.array(z.string().min(1).max(128)).max(16),
    composerOutputDigest: z.string().regex(/^[a-f0-9]{64}$/),
    draft: z.string().min(1).max(200_000),
    citedEvidenceIds: z.array(z.string().min(1).max(256)).max(500),
    evidence: z.array(AdvisorEvidenceSchema).min(1).max(MAX_EVIDENCE_ITEMS),
    warnings: z.array(z.string().min(1).max(2048)).max(256),
    conflicts: z
      .array(
        z
          .object({
            id: z.string().min(1).max(256),
            severity: z.enum(['info', 'warn', 'block']),
            reason: z.string().min(1).max(4096),
            evidenceIds: z.array(z.string().min(1).max(256)).max(500)
          })
          .strict()
      )
      .max(500)
  })
  .strict()
  .transform(value => deepFreeze(value))

const AdvisorModelOutputSchema = z
  .object({
    decision: z.enum(['approve', 'repair', 'block']),
    reasonCodes: z.array(AdvisorReasonCodeSchema).max(MAX_REASON_CODES),
    unsupportedClaimIds: z
      .array(z.string().min(1).max(256))
      .max(MAX_REFERENCED_IDS),
    citationRiskEvidenceIds: z
      .array(z.string().min(1).max(256))
      .max(MAX_REFERENCED_IDS),
    confidence: z.number().finite().min(0).max(1)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decision === 'approve') {
      if (
        value.unsupportedClaimIds.length > 0 ||
        value.citationRiskEvidenceIds.length > 0 ||
        value.reasonCodes.length !== 1 ||
        value.reasonCodes[0] !== 'advisor_ready'
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Approved Advisor output must contain exactly advisor_ready and no unresolved risks.'
        })
      }
      return
    }
    if (value.reasonCodes.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'Non-approved Advisor output requires a reason code.'
      })
    }
  })

export type AdvisorModelInput = z.infer<typeof AdvisorInputSchema>
export type AdvisorModelOutput = z.infer<typeof AdvisorModelOutputSchema>

export type PendingAdvisorReview = Readonly<{
  decision: AdvisorModelOutput['decision']
  reasonCodes: readonly AdvisorReasonCode[]
  unsupportedClaimIds: readonly string[]
  citationRiskEvidenceIds: readonly string[]
  confidence: number
  releaseStatus: 'pending_citation_verifier_and_final_release'
  roleExecution: RoleRunnerOutcome<AdvisorModelOutput>['result']
}>

export type ProductionAdvisorAdapterOptions = Readonly<{
  scope: TrustedRoleExecutionScope
  candidates: readonly unknown[]
  provider: RoleProviderAdapter<AdvisorModelInput>
  limits?: RoleRunnerLimits
}>

export type ProductionAdvisorReviewInput = Readonly<{
  query: string
  routeContext: RouteExecutionContext
  evidenceGraph: EvidenceGraph
  approval: CoordinatorCompositionApproval
  composition: PendingCompositionDraft
  signal?: AbortSignal
}>

const DEFAULT_LIMITS: RoleRunnerLimits = Object.freeze({
  maxInputBytes: 2_000_000,
  maxOutputBytes: 64_000,
  maxOutputTokens: 4_000
})

const ADVISOR_PROMPT = Object.freeze({
  version: 'advisor-evidence-and-draft-only-v1',
  instruction: [
    'Review the pending draft only against the supplied admitted evidence and route requirements.',
    'Do not retrieve, browse, call tools, add evidence, rewrite the draft, or approve release.',
    'Return only the structured approve, repair, or block decision.',
    'Reference only claim and evidence IDs present in the input.',
    'Approval is advisory and remains subject to citation verification and deterministic release policy.'
  ].join(' '),
  inputSchemaVersion: 1,
  outputSchemaVersion: 1
})

function digestComposition(composition: PendingCompositionDraft): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        draft: composition.draft,
        citedEvidenceIds: [...composition.citedEvidenceIds]
      })
    )
    .digest('hex')
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

  const digest = digestComposition(composition)
  if (digest !== result.outputDigest) {
    throw new Error('Composer output digest mismatch.')
  }
  return digest
}

function buildAdvisorInput(
  query: string,
  routeContext: RouteExecutionContext,
  evidenceGraph: EvidenceGraph,
  composition: PendingCompositionDraft,
  composerOutputDigest: string
): AdvisorModelInput {
  const input = {
    query,
    routeDigest: routeContext.routeDigest,
    riskLevel: routeContext.routePlan.riskLevel,
    requiredSourceClasses: [...routeContext.routePlan.requiredSourceClasses],
    composerOutputDigest,
    draft: composition.draft,
    citedEvidenceIds: [...composition.citedEvidenceIds],
    evidence: evidenceGraph.items.map(item => ({
      id: item.id,
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

  const parsed = AdvisorInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error('Invalid Advisor review input.')
  }
  return parsed.data
}

function validateReferences(
  output: AdvisorModelOutput,
  input: AdvisorModelInput
): void {
  const admittedEvidence = new Set(input.evidence.map(item => item.id))
  const admittedClaims = new Set(input.evidence.flatMap(item => item.claimIds))
  if (output.citationRiskEvidenceIds.some(id => !admittedEvidence.has(id))) {
    throw new Error('Advisor referenced evidence outside the approved graph.')
  }
  if (output.unsupportedClaimIds.some(id => !admittedClaims.has(id))) {
    throw new Error('Advisor referenced claims outside the approved graph.')
  }
}

export function createProductionAdvisorAdapter(
  options: ProductionAdvisorAdapterOptions
): Readonly<{
  review(input: ProductionAdvisorReviewInput): Promise<PendingAdvisorReview>
}> {
  if (!options || typeof options !== 'object') {
    throw new Error('Invalid production Advisor configuration.')
  }

  return Object.freeze({
    async review(input) {
      if (!input || typeof input !== 'object') {
        throw new Error('Invalid production Advisor input.')
      }
      const query = typeof input.query === 'string' ? input.query.trim() : ''
      if (!query || query.length > MAX_QUERY_LENGTH) {
        throw new Error('Invalid production Advisor query.')
      }

      const routeContext = createRouteExecutionContext(input.routeContext)
      assertCoordinatorCompositionApproval(
        input.approval,
        routeContext,
        input.evidenceGraph
      )
      if (!routeContext.routePlan.requiredModelRoles.includes('advisor')) {
        throw new Error('Router did not authorize Advisor execution.')
      }

      const composerOutputDigest = assertCompositionIntegrity(input.composition)
      const advisorInput = buildAdvisorInput(
        query,
        routeContext,
        input.evidenceGraph,
        input.composition,
        composerOutputDigest
      )

      const outcome = await runRole({
        scope: options.scope,
        role: 'advisor',
        candidates: options.candidates,
        prompt: ADVISOR_PROMPT,
        inputSchema: AdvisorInputSchema,
        outputSchema: AdvisorModelOutputSchema,
        input: advisorInput,
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
          `Advisor execution failed: ${outcome.result.failureClass ?? 'unknown'}.`
        )
      }

      validateReferences(outcome.output, advisorInput)
      return Object.freeze({
        decision: outcome.output.decision,
        reasonCodes: Object.freeze([...new Set(outcome.output.reasonCodes)]),
        unsupportedClaimIds: Object.freeze([
          ...new Set(outcome.output.unsupportedClaimIds)
        ]),
        citationRiskEvidenceIds: Object.freeze([
          ...new Set(outcome.output.citationRiskEvidenceIds)
        ]),
        confidence: outcome.output.confidence,
        releaseStatus: 'pending_citation_verifier_and_final_release' as const,
        roleExecution: outcome.result
      })
    }
  })
}
