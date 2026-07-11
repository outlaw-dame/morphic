import { z } from 'zod'

import { ModelRoleSchema, RoutePlanSchema } from '@/lib/ai/schemas'

export const AI_ARCHITECTURE_CONTRACT_VERSION = 1 as const

const BoundedIdSchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/)
const BoundedCodeSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9_:-]+$/)
const IsoDateSchema = z.string().datetime({ offset: true })

export const ArchitectureImplementationStatusSchema = z.enum([
  'documented',
  'scaffolded',
  'implemented_in_isolation',
  'integrated',
  'enforced',
  'production_enabled'
])
export type ArchitectureImplementationStatus = z.infer<
  typeof ArchitectureImplementationStatusSchema
>

export const RoleFailureClassSchema = z.enum([
  'invalid_input',
  'no_eligible_model',
  'timeout',
  'cancelled',
  'transient_provider_failure',
  'permanent_provider_failure',
  'malformed_output',
  'schema_version_mismatch',
  'policy_violation'
])
export type RoleFailureClass = z.infer<typeof RoleFailureClassSchema>

export const RoleExecutionRequestSchema = z
  .object({
    version: z.literal(AI_ARCHITECTURE_CONTRACT_VERSION),
    executionId: BoundedIdSchema,
    invocationId: BoundedIdSchema,
    role: ModelRoleSchema,
    inputSchemaVersion: z.number().int().positive().max(1000),
    outputSchemaVersion: z.number().int().positive().max(1000),
    promptVersion: z.string().min(1).max(64),
    selectedModelId: z.string().min(1).max(256).nullable(),
    contextDigest: z.string().min(16).max(256),
    deadlineAt: IsoDateSchema,
    maxInputBytes: z.number().int().positive().max(10_000_000),
    maxOutputBytes: z.number().int().positive().max(2_000_000),
    maxOutputTokens: z.number().int().positive().max(100_000),
    reasonCodes: z.array(BoundedCodeSchema).max(32)
  })
  .strict()
export type RoleExecutionRequest = z.infer<typeof RoleExecutionRequestSchema>

export const RoleExecutionResultSchema = z
  .object({
    version: z.literal(AI_ARCHITECTURE_CONTRACT_VERSION),
    executionId: BoundedIdSchema,
    invocationId: BoundedIdSchema,
    role: ModelRoleSchema,
    status: z.enum(['succeeded', 'failed', 'cancelled']),
    outputSchemaVersion: z.number().int().positive().max(1000),
    promptVersion: z.string().min(1).max(64),
    selectedModelId: z.string().min(1).max(256).nullable(),
    startedAt: IsoDateSchema,
    completedAt: IsoDateSchema,
    outputDigest: z.string().min(16).max(256).nullable(),
    failureClass: RoleFailureClassSchema.nullable(),
    reasonCodes: z.array(BoundedCodeSchema).max(32)
  })
  .strict()
  .superRefine((value, context) => {
    const failed = value.status !== 'succeeded'
    if (failed !== (value.failureClass !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Failure class must be present exactly when execution did not succeed.',
        path: ['failureClass']
      })
    }
  })
export type RoleExecutionResult = z.infer<typeof RoleExecutionResultSchema>

export const RouteDecisionProvenanceSchema = z
  .object({
    version: z.literal(AI_ARCHITECTURE_CONTRACT_VERSION),
    executionId: BoundedIdSchema,
    deterministicRoute: RoutePlanSchema,
    modelRouteDigest: z.string().min(16).max(256).nullable(),
    mergedRoute: RoutePlanSchema,
    mergePolicyVersion: z.string().min(1).max(64),
    reasonCodes: z.array(BoundedCodeSchema).min(1).max(64)
  })
  .strict()
export type RouteDecisionProvenance = z.infer<
  typeof RouteDecisionProvenanceSchema
>

export const CoordinatorLifecycleStateSchema = z.enum([
  'created',
  'routed',
  'planning',
  'retrieving',
  'normalizing_evidence',
  'grounding_entities',
  'evaluating_evidence',
  'awaiting_repairs',
  'composing',
  'advising',
  'verifying',
  'repairing',
  'ready_for_release',
  'released',
  'refused_or_caveated',
  'cancelled',
  'failed'
])
export type CoordinatorLifecycleState = z.infer<
  typeof CoordinatorLifecycleStateSchema
>

export const CoordinatorTransitionSchema = z
  .object({
    version: z.literal(AI_ARCHITECTURE_CONTRACT_VERSION),
    executionId: BoundedIdSchema,
    expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    from: CoordinatorLifecycleStateSchema,
    to: CoordinatorLifecycleStateSchema,
    eventId: BoundedIdSchema,
    occurredAt: IsoDateSchema,
    reasonCodes: z.array(BoundedCodeSchema).min(1).max(32)
  })
  .strict()
export type CoordinatorTransition = z.infer<typeof CoordinatorTransitionSchema>

export const ToolBudgetLedgerSchema = z
  .object({
    version: z.literal(AI_ARCHITECTURE_CONTRACT_VERSION),
    executionId: BoundedIdSchema,
    maxToolCalls: z.number().int().nonnegative().max(1000),
    usedToolCalls: z.number().int().nonnegative().max(1000),
    maxRetrievalPaths: z.number().int().nonnegative().max(100),
    usedRetrievalPaths: z.number().int().nonnegative().max(100),
    maxModelCalls: z.number().int().nonnegative().max(100),
    usedModelCalls: z.number().int().nonnegative().max(100),
    deadlineAt: IsoDateSchema
  })
  .strict()
  .superRefine((value, context) => {
    const pairs = [
      ['usedToolCalls', value.usedToolCalls, value.maxToolCalls],
      ['usedRetrievalPaths', value.usedRetrievalPaths, value.maxRetrievalPaths],
      ['usedModelCalls', value.usedModelCalls, value.maxModelCalls]
    ] as const
    for (const [path, used, maximum] of pairs) {
      if (used > maximum) {
        context.addIssue({
          code: 'custom',
          message: 'Used budget cannot exceed maximum budget.',
          path: [path]
        })
      }
    }
  })
export type ToolBudgetLedger = z.infer<typeof ToolBudgetLedgerSchema>

export const EntityProviderSchema = z.enum(['wikidata', 'dbpedia'])
export type EntityProvider = z.infer<typeof EntityProviderSchema>

export const EntityProviderResultSchema = z
  .object({
    version: z.literal(AI_ARCHITECTURE_CONTRACT_VERSION),
    executionId: BoundedIdSchema,
    provider: EntityProviderSchema,
    mentionId: BoundedIdSchema,
    status: z.enum(['succeeded', 'not_found', 'failed', 'cancelled']),
    canonicalIds: z.array(z.string().min(1).max(512)).max(32),
    resultDigest: z.string().min(16).max(256).nullable(),
    retrievedAt: IsoDateSchema,
    failureClass: RoleFailureClassSchema.nullable(),
    reasonCodes: z.array(BoundedCodeSchema).max(32)
  })
  .strict()
  .superRefine((value, context) => {
    const failed = value.status === 'failed' || value.status === 'cancelled'
    if (failed !== (value.failureClass !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Failure class must match provider result status.',
        path: ['failureClass']
      })
    }
  })
export type EntityProviderResult = z.infer<typeof EntityProviderResultSchema>

export const FinalReleaseDecisionSchema = z
  .object({
    version: z.literal(AI_ARCHITECTURE_CONTRACT_VERSION),
    executionId: BoundedIdSchema,
    decision: z.enum(['release', 'refuse', 'caveat']),
    routeDigest: z.string().min(16).max(256),
    evidenceGraphDigest: z.string().min(16).max(256),
    draftDigest: z.string().min(16).max(256).nullable(),
    verificationDigest: z.string().min(16).max(256).nullable(),
    reasonCodes: z.array(BoundedCodeSchema).min(1).max(64),
    decidedAt: IsoDateSchema
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.decision === 'release' &&
      (value.draftDigest === null || value.verificationDigest === null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Release requires both draft and verification digests.'
      })
    }
  })
export type FinalReleaseDecision = z.infer<typeof FinalReleaseDecisionSchema>
