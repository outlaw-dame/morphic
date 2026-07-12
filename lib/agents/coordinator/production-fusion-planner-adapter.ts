import { z } from 'zod'

import { getRolePrompt } from '@/lib/ai/prompts'
import {
  createRouteExecutionContext,
  type RouteExecutionContext
} from '@/lib/ai/router/execution-context'
import { SourceClassSchema } from '@/lib/ai/schemas'
import {
  runRole,
  type RoleProviderAdapter,
  type RoleRunnerLimits,
  type RoleRunnerOutcome,
  type TrustedRoleExecutionScope
} from '@/lib/ai/role-runner'

const MAX_QUERY_LENGTH = 16_000
const MAX_PATHS = 8
const MAX_PATH_QUERY_LENGTH = 2_000

const EvidenceRoleSchema = z.enum([
  'primary_evidence',
  'independent_corroboration',
  'freshness_check',
  'entity_disambiguation',
  'contradiction_check',
  'background_context'
])

const FusionPlannerInputSchema = z
  .object({
    query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
    routeDigest: z.string().regex(/^[a-f0-9]{64}$/),
    mode: z.enum(['quick', 'adaptive', 'deep', 'critical']),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    requiredSourceClasses: z.array(SourceClassSchema).max(16),
    disallowedSourceClasses: z.array(SourceClassSchema).max(16),
    needsFreshness: z.boolean(),
    needsEntityGrounding: z.boolean(),
    maxToolCalls: z.number().int().positive().max(100)
  })
  .strict()
  .transform(value =>
    Object.freeze({
      ...value,
      requiredSourceClasses: Object.freeze([...value.requiredSourceClasses]),
      disallowedSourceClasses: Object.freeze([...value.disallowedSourceClasses])
    })
  )

const FusionPathSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
    query: z.string().trim().min(1).max(MAX_PATH_QUERY_LENGTH),
    sourceClass: SourceClassSchema,
    evidenceRole: EvidenceRoleSchema,
    maxResults: z.number().int().min(1).max(50),
    requiresFreshness: z.boolean()
  })
  .strict()

const FusionPlannerOutputSchema = z
  .object({
    paths: z.array(FusionPathSchema).min(1).max(MAX_PATHS),
    reasonCodes: z
      .array(z.string().regex(/^[a-z0-9_:-]{1,128}$/))
      .max(16)
      .transform(values => [...new Set(values)])
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.paths.map(path => path.id)
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        message: 'Fusion path identifiers must be unique.',
        path: ['paths']
      })
    }
  })

export type FusionPlannerModelInput = z.infer<typeof FusionPlannerInputSchema>
export type FusionPlannerModelOutput = z.infer<typeof FusionPlannerOutputSchema>
export type ProductionFusionPlan = Readonly<{
  routeDigest: string
  paths: readonly z.infer<typeof FusionPathSchema>[]
  reasonCodes: readonly string[]
  roleExecution: RoleRunnerOutcome<FusionPlannerModelOutput>['result']
}>

export type ProductionFusionPlannerOptions = Readonly<{
  scope: TrustedRoleExecutionScope
  candidates: readonly unknown[]
  provider: RoleProviderAdapter<FusionPlannerModelInput>
  limits?: RoleRunnerLimits
}>

const DEFAULT_LIMITS: RoleRunnerLimits = Object.freeze({
  maxInputBytes: 100_000,
  maxOutputBytes: 100_000,
  maxOutputTokens: 4_000
})

function throwCancellation(signal?: AbortSignal): never {
  if (signal?.reason instanceof Error) throw signal.reason
  const message =
    typeof signal?.reason === 'string'
      ? signal.reason
      : 'The Fusion Planner operation was aborted.'
  throw typeof DOMException !== 'undefined'
    ? new DOMException(message, 'AbortError')
    : new Error(message)
}

function buildInput(
  query: string,
  routeContext: RouteExecutionContext
): FusionPlannerModelInput {
  const plan = routeContext.routePlan
  const parsed = FusionPlannerInputSchema.safeParse({
    query,
    routeDigest: routeContext.routeDigest,
    mode: plan.mode,
    riskLevel: plan.riskLevel,
    requiredSourceClasses: [...plan.requiredSourceClasses],
    disallowedSourceClasses: [...plan.disallowedSourceClasses],
    needsFreshness: plan.needsFreshness,
    needsEntityGrounding: plan.needsEntityGrounding,
    maxToolCalls: plan.maxToolCalls
  })
  if (!parsed.success) throw new Error('Invalid Fusion Planner input.')
  return parsed.data
}

function validatePlan(
  output: FusionPlannerModelOutput,
  input: FusionPlannerModelInput
): readonly z.infer<typeof FusionPathSchema>[] {
  const disallowed = new Set(input.disallowedSourceClasses)
  if (output.paths.some(path => disallowed.has(path.sourceClass))) {
    throw new Error('Fusion Planner selected a disallowed source class.')
  }
  if (
    input.requiredSourceClasses.some(
      required => !output.paths.some(path => path.sourceClass === required)
    )
  ) {
    throw new Error('Fusion Planner omitted a required source class.')
  }
  if (
    input.needsFreshness &&
    !output.paths.some(path => path.requiresFreshness)
  ) {
    throw new Error('Fusion Planner omitted the required freshness path.')
  }
  if (
    input.needsEntityGrounding &&
    !output.paths.some(path => path.evidenceRole === 'entity_disambiguation')
  ) {
    throw new Error('Fusion Planner omitted the required entity path.')
  }
  return Object.freeze(output.paths.map(path => Object.freeze({ ...path })))
}

export function createProductionFusionPlanner(
  options: ProductionFusionPlannerOptions
): Readonly<{
  plan(input: Readonly<{
    query: string
    routeContext: RouteExecutionContext
    signal?: AbortSignal
  }>): Promise<ProductionFusionPlan>
}> {
  if (!options || typeof options !== 'object') {
    throw new Error('Invalid production Fusion Planner configuration.')
  }

  return Object.freeze({
    async plan(input) {
      if (!input || typeof input !== 'object') {
        throw new Error('Invalid production Fusion Planner request.')
      }
      const query = typeof input.query === 'string' ? input.query.trim() : ''
      if (!query || query.length > MAX_QUERY_LENGTH) {
        throw new Error('Invalid production Fusion Planner query.')
      }
      const routeContext = createRouteExecutionContext(input.routeContext)
      if (!routeContext.routePlan.needsFusionPlanning) {
        throw new Error('Router did not authorize Fusion Planner execution.')
      }
      const modelInput = buildInput(query, routeContext)
      const prompt = getRolePrompt('fusion_planner')
      const outcome = await runRole({
        scope: options.scope,
        role: 'fusion_planner',
        candidates: options.candidates,
        prompt: {
          version: prompt.version,
          instruction: prompt.systemPrompt,
          inputSchemaVersion: 1,
          outputSchemaVersion: 1
        },
        inputSchema: FusionPlannerInputSchema,
        outputSchema: FusionPlannerOutputSchema,
        input: modelInput,
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
          `Fusion Planner execution failed: ${outcome.result.failureClass ?? 'unknown'}.`
        )
      }

      return Object.freeze({
        routeDigest: routeContext.routeDigest,
        paths: validatePlan(outcome.output, modelInput),
        reasonCodes: Object.freeze([...outcome.output.reasonCodes]),
        roleExecution: outcome.result
      })
    }
  })
}
