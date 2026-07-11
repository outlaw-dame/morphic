import { createHash } from 'node:crypto'
import { z, type ZodType } from 'zod'

import {
  AI_ARCHITECTURE_CONTRACT_VERSION,
  parseArchitectureContract,
  type RoleExecutionRequest,
  RoleExecutionRequestSchema,
  type RoleExecutionResult,
  RoleExecutionResultSchema,
  type RoleFailureClass
} from '@/lib/ai/architecture'
import { type ModelRole, ModelRoleSchema } from '@/lib/ai/schemas'
import { getRoleSelectionProfileV2 } from '@/lib/models/role-profiles-v2'
import {
  type RoleModelCandidate,
  selectModelForRoleV2
} from '@/lib/models/role-selection-v2'

export const ROLE_TOOL_PERMISSION_CLASSES = [
  'none',
  'retrieval_plan_only',
  'bounded_retrieval',
  'entity_resolution_only',
  'evidence_read_only',
  'draft_repair_only'
] as const

export const RoleToolPermissionClassSchema = z.enum(
  ROLE_TOOL_PERMISSION_CLASSES
)
export type RoleToolPermissionClass = z.infer<
  typeof RoleToolPermissionClassSchema
>

const MAX_ROLE_DEADLINE_MS = 10 * 60 * 1000

const BoundedIdSchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/)

const TrustedScopeInputSchema = z
  .object({
    ownerScopeId: BoundedIdSchema,
    executionId: BoundedIdSchema,
    invocationId: BoundedIdSchema,
    deadlineAt: z.string().datetime({ offset: true }),
    allowedPermissionClasses: z
      .array(RoleToolPermissionClassSchema)
      .min(1)
      .max(ROLE_TOOL_PERMISSION_CLASSES.length)
  })
  .strict()

const PromptDefinitionSchema = z
  .object({
    version: z.string().min(1).max(64),
    instruction: z.string().min(1).max(100_000),
    inputSchemaVersion: z.number().int().positive().max(1000),
    outputSchemaVersion: z.number().int().positive().max(1000)
  })
  .strict()

const RunnerLimitsSchema = z
  .object({
    maxInputBytes: z.number().int().positive().max(10_000_000),
    maxOutputBytes: z.number().int().positive().max(2_000_000),
    maxOutputTokens: z.number().int().positive().max(100_000)
  })
  .strict()

const RetryPolicySchema = z
  .object({
    maxAttempts: z.number().int().min(1).max(3),
    initialDelayMs: z.number().int().min(10).max(10_000),
    maximumDelayMs: z.number().int().min(10).max(30_000),
    idempotent: z.boolean()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.maximumDelayMs < value.initialDelayMs) {
      context.addIssue({
        code: 'custom',
        message: 'Maximum delay must not be lower than initial delay.',
        path: ['maximumDelayMs']
      })
    }
  })

const CapabilityAssertionSchema = z
  .object({
    capability: z.enum([
      'tool_calling',
      'structured_output',
      'streaming',
      'reasoning',
      'vision',
      'pdf_input',
      'json_mode',
      'local_execution'
    ]),
    provenance: z.enum([
      'evaluation_verified',
      'deployment_configured',
      'model_card_declared',
      'provider_declared',
      'inferred',
      'unknown'
    ])
  })
  .strict()

const RoleQualityScoreSchema = z
  .object({
    role: ModelRoleSchema,
    score: z.number().finite().min(0).max(1),
    fixtureVersion: z.string().min(1).max(128),
    verifiedAt: z.string().datetime({ offset: true })
  })
  .strict()

const RoleModelCandidateSchema = z
  .object({
    providerId: z.string().trim().min(1).max(128),
    modelId: z.string().trim().min(1).max(256),
    family: z.string().trim().min(1).max(128),
    availability: z.enum([
      'available',
      'disabled',
      'deprecated',
      'unavailable'
    ]),
    locality: z.enum(['local', 'remote']),
    reliability: z.enum(['unknown', 'experimental', 'standard', 'strong']),
    maxContextTokens: z.number().int().positive().max(10_000_000),
    estimatedLatencyMs: z.number().finite().nonnegative().max(600_000),
    estimatedCostPerMillionTokensUsd: z
      .number()
      .finite()
      .nonnegative()
      .max(100_000),
    capabilities: z.array(CapabilityAssertionSchema).max(64),
    roleQuality: z.array(RoleQualityScoreSchema).max(64),
    cooldownUntil: z.string().datetime({ offset: true }).nullable().optional()
  })
  .strict()

const ProviderResponseSchema = z
  .object({
    output: z.unknown(),
    outputTokens: z.number().int().nonnegative().max(100_000)
  })
  .strict()

const trustedScopes = new WeakSet<object>()
const textEncoder = new TextEncoder()

export type TrustedRoleExecutionScope = Readonly<{
  ownerScopeId: string
  executionId: string
  invocationId: string
  deadlineAt: string
  allowedPermissionClasses: readonly RoleToolPermissionClass[]
}>

export type RolePromptDefinition = Readonly<{
  version: string
  instruction: string
  inputSchemaVersion: number
  outputSchemaVersion: number
}>

export type RoleRunnerLimits = Readonly<{
  maxInputBytes: number
  maxOutputBytes: number
  maxOutputTokens: number
}>

export type RoleRunnerRetryPolicy = Readonly<{
  maxAttempts: number
  initialDelayMs: number
  maximumDelayMs: number
  idempotent: boolean
}>

export type RoleProviderInvocation<TInput> = Readonly<{
  ownerScopeId: string
  executionId: string
  invocationId: string
  role: ModelRole
  providerId: string
  modelId: string
  promptVersion: string
  instruction: string
  input: TInput
  outputSchemaVersion: number
  maxOutputBytes: number
  maxOutputTokens: number
  permissionClass: RoleToolPermissionClass
  attempt: number
  signal: AbortSignal
}>

export type RoleProviderAdapter<TInput> = Readonly<{
  invoke(
    invocation: RoleProviderInvocation<TInput>
  ): Promise<Readonly<{ output: unknown; outputTokens: number }>>
}>

export type DeterministicRoleFallback<TInput> = (
  input: TInput,
  context: Readonly<{
    ownerScopeId: string
    executionId: string
    invocationId: string
    role: ModelRole
    signal: AbortSignal
  }>
) => Promise<unknown> | unknown

export type RoleRunnerOutcome<TOutput> = Readonly<{
  request: RoleExecutionRequest
  result: RoleExecutionResult
  output: TOutput | null
}>

export class InvalidTrustedRoleExecutionScopeError extends Error {
  constructor() {
    super('Invalid trusted role execution scope.')
    this.name = 'InvalidTrustedRoleExecutionScopeError'
  }
}

export class InvalidRoleRunnerConfigurationError extends Error {
  constructor() {
    super('Invalid role runner configuration.')
    this.name = 'InvalidRoleRunnerConfigurationError'
  }
}

export class TransientRoleProviderError extends Error {
  constructor() {
    super('Transient role provider failure.')
    this.name = 'TransientRoleProviderError'
  }
}

export class PermanentRoleProviderError extends Error {
  constructor() {
    super('Permanent role provider failure.')
    this.name = 'PermanentRoleProviderError'
  }
}

class RoleRunnerTimeoutError extends Error {}
class RoleRunnerCancelledError extends Error {}
class MalformedRoleProviderResponseError extends Error {}
class RoleOutputLimitError extends Error {}

export function createTrustedRoleExecutionScope(
  input: TrustedRoleExecutionScope
): TrustedRoleExecutionScope {
  let parsed: z.infer<typeof TrustedScopeInputSchema>
  try {
    parsed = parseArchitectureContract(TrustedScopeInputSchema, input)
  } catch {
    throw new InvalidTrustedRoleExecutionScopeError()
  }

  const scope = Object.freeze({
    ownerScopeId: parsed.ownerScopeId,
    executionId: parsed.executionId,
    invocationId: parsed.invocationId,
    deadlineAt: parsed.deadlineAt,
    allowedPermissionClasses: Object.freeze([
      ...new Set(parsed.allowedPermissionClasses)
    ])
  })
  trustedScopes.add(scope)
  return scope
}

function assertTrustedScope(scope: TrustedRoleExecutionScope): void {
  if (!trustedScopes.has(scope))
    throw new InvalidTrustedRoleExecutionScopeError()
}

function canonicalJson(value: unknown): string {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new MalformedRoleProviderResponseError()
  return serialized
}

function byteLength(value: string): number {
  return textEncoder.encode(value).byteLength
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function readNow(now: () => Date): Date {
  const value = now()
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new InvalidRoleRunnerConfigurationError()
  }
  return value
}

function selectedModelIdentity(candidate: RoleModelCandidate): string {
  return `${candidate.providerId}/${candidate.modelId}`
}

function safeReasonCodes(codes: readonly string[]): readonly string[] {
  const safe = codes.filter(code => /^[a-z0-9_:-]{1,128}$/.test(code))
  return Object.freeze([...new Set(safe)].slice(0, 32))
}

function buildResult(input: {
  request: RoleExecutionRequest
  status: RoleExecutionResult['status']
  startedAt: string
  completedAt: string
  outputDigest: string | null
  failureClass: RoleFailureClass | null
  reasonCodes: readonly string[]
}): RoleExecutionResult {
  return RoleExecutionResultSchema.parse({
    version: AI_ARCHITECTURE_CONTRACT_VERSION,
    executionId: input.request.executionId,
    invocationId: input.request.invocationId,
    role: input.request.role,
    status: input.status,
    outputSchemaVersion: input.request.outputSchemaVersion,
    promptVersion: input.request.promptVersion,
    selectedModelId: input.request.selectedModelId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    outputDigest: input.outputDigest,
    failureClass: input.failureClass,
    reasonCodes: safeReasonCodes(input.reasonCodes)
  })
}

function classifyFailure(error: unknown): RoleFailureClass {
  if (error instanceof RoleRunnerTimeoutError) return 'timeout'
  if (error instanceof RoleRunnerCancelledError) return 'cancelled'
  if (error instanceof TransientRoleProviderError) {
    return 'transient_provider_failure'
  }
  if (error instanceof PermanentRoleProviderError) {
    return 'permanent_provider_failure'
  }
  if (
    error instanceof MalformedRoleProviderResponseError ||
    error instanceof RoleOutputLimitError
  ) {
    return 'malformed_output'
  }
  return 'permanent_provider_failure'
}

function cancellableDelay(
  milliseconds: number,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) return Promise.reject(new RoleRunnerCancelledError())

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(new RoleRunnerCancelledError())
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function invokeWithDeadline<T>(options: {
  operation: (signal: AbortSignal) => Promise<T>
  callerSignal?: AbortSignal
  deadlineAt: number
  now: () => Date
}): Promise<T> {
  if (options.callerSignal?.aborted) throw new RoleRunnerCancelledError()

  const remainingMs = options.deadlineAt - readNow(options.now).getTime()
  if (remainingMs <= 0) throw new RoleRunnerTimeoutError()
  if (remainingMs > MAX_ROLE_DEADLINE_MS) {
    throw new InvalidRoleRunnerConfigurationError()
  }

  const controller = new AbortController()
  let timedOut = false
  let rejectAbort: ((error: Error) => void) | undefined
  const onCallerAbort = () => controller.abort()
  const onCombinedAbort = () => {
    rejectAbort?.(
      timedOut ? new RoleRunnerTimeoutError() : new RoleRunnerCancelledError()
    )
  }

  options.callerSignal?.addEventListener('abort', onCallerAbort, { once: true })
  controller.signal.addEventListener('abort', onCombinedAbort, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, remainingMs)

  const abortPromise = new Promise<T>((_, reject) => {
    rejectAbort = reject
  })

  try {
    return await Promise.race([
      options.operation(controller.signal),
      abortPromise
    ])
  } finally {
    clearTimeout(timer)
    controller.signal.removeEventListener('abort', onCombinedAbort)
    options.callerSignal?.removeEventListener('abort', onCallerAbort)
  }
}

function validateConfiguration(input: {
  role: ModelRole
  prompt: RolePromptDefinition
  limits: RoleRunnerLimits
  retryPolicy: RoleRunnerRetryPolicy
}): void {
  try {
    ModelRoleSchema.parse(input.role)
    parseArchitectureContract(PromptDefinitionSchema, input.prompt)
    parseArchitectureContract(RunnerLimitsSchema, input.limits)
    parseArchitectureContract(RetryPolicySchema, input.retryPolicy)
  } catch {
    throw new InvalidRoleRunnerConfigurationError()
  }
}

function normalizeCandidates(
  candidates: readonly unknown[]
): readonly unknown[] {
  return Object.freeze(
    candidates.map(candidate => {
      try {
        return parseArchitectureContract(RoleModelCandidateSchema, candidate)
      } catch {
        return null
      }
    })
  )
}

function canRetry(
  error: unknown,
  permissionClass: RoleToolPermissionClass,
  retryPolicy: RoleRunnerRetryPolicy,
  attempt: number
): boolean {
  return (
    error instanceof TransientRoleProviderError &&
    permissionClass === 'none' &&
    retryPolicy.idempotent &&
    attempt < retryPolicy.maxAttempts
  )
}

export async function runRole<TInput, TOutput>(
  options: Readonly<{
    scope: TrustedRoleExecutionScope
    role: ModelRole
    candidates: readonly unknown[]
    prompt: RolePromptDefinition
    inputSchema: ZodType<TInput>
    outputSchema: ZodType<TOutput>
    input: unknown
    adapter: RoleProviderAdapter<TInput>
    limits: RoleRunnerLimits
    retryPolicy?: RoleRunnerRetryPolicy
    deterministicFallback?: DeterministicRoleFallback<TInput>
    signal?: AbortSignal
    now?: () => Date
  }>
): Promise<RoleRunnerOutcome<TOutput>> {
  assertTrustedScope(options.scope)

  const retryPolicy = options.retryPolicy ?? {
    maxAttempts: 1,
    initialDelayMs: 100,
    maximumDelayMs: 1000,
    idempotent: false
  }
  validateConfiguration({
    role: options.role,
    prompt: options.prompt,
    limits: options.limits,
    retryPolicy
  })

  const now = options.now ?? (() => new Date())
  const startedAt = readNow(now).toISOString()
  const profile = getRoleSelectionProfileV2(options.role)
  const permissionClass = RoleToolPermissionClassSchema.parse(
    profile.requiredToolPermissionClass
  )

  let parsedInput: TInput | null = null
  try {
    parsedInput = parseArchitectureContract(options.inputSchema, options.input)
  } catch {
    parsedInput = null
  }

  const inputJson = parsedInput === null ? '' : canonicalJson(parsedInput)
  const contextJson = canonicalJson({
    promptVersion: options.prompt.version,
    instruction: options.prompt.instruction,
    input: parsedInput
  })
  const selection = selectModelForRoleV2(
    normalizeCandidates(options.candidates),
    profile,
    {
      now: readNow(now),
      deterministicFallbackAvailable:
        options.deterministicFallback !== undefined
    }
  )
  const candidateIdentity =
    selection.status === 'selected'
      ? selectedModelIdentity(selection.candidate)
      : null
  const selectedModelId =
    candidateIdentity !== null && candidateIdentity.length <= 256
      ? candidateIdentity
      : null

  const request = RoleExecutionRequestSchema.parse({
    version: AI_ARCHITECTURE_CONTRACT_VERSION,
    executionId: options.scope.executionId,
    invocationId: options.scope.invocationId,
    role: options.role,
    inputSchemaVersion: options.prompt.inputSchemaVersion,
    outputSchemaVersion: options.prompt.outputSchemaVersion,
    promptVersion: options.prompt.version,
    selectedModelId,
    contextDigest: digest(contextJson),
    deadlineAt: options.scope.deadlineAt,
    maxInputBytes: options.limits.maxInputBytes,
    maxOutputBytes: options.limits.maxOutputBytes,
    maxOutputTokens: options.limits.maxOutputTokens,
    reasonCodes: safeReasonCodes(selection.reasonCodes)
  })

  const fail = (
    failureClass: RoleFailureClass,
    reasonCodes: readonly string[]
  ): RoleRunnerOutcome<TOutput> =>
    Object.freeze({
      request,
      result: buildResult({
        request,
        status: failureClass === 'cancelled' ? 'cancelled' : 'failed',
        startedAt,
        completedAt: readNow(now).toISOString(),
        outputDigest: null,
        failureClass,
        reasonCodes
      }),
      output: null
    })

  if (parsedInput === null) {
    return fail('invalid_input', ['invalid_role_input'])
  }
  const trustedInput = parsedInput
  if (
    byteLength(inputJson) + byteLength(options.prompt.instruction) >
    options.limits.maxInputBytes
  ) {
    return fail('invalid_input', ['role_input_limit_exceeded'])
  }
  if (!options.scope.allowedPermissionClasses.includes(permissionClass)) {
    return fail('policy_violation', ['tool_permission_not_granted'])
  }
  if (candidateIdentity !== null && selectedModelId === null) {
    return fail('invalid_input', ['selected_model_identity_too_long'])
  }
  if (selection.status === 'no_eligible_model') {
    return fail('no_eligible_model', ['no_eligible_model'])
  }
  if (options.signal?.aborted) return fail('cancelled', ['caller_cancelled'])

  const deadlineAt = Date.parse(options.scope.deadlineAt)
  const remainingMs = deadlineAt - readNow(now).getTime()
  if (!Number.isFinite(deadlineAt) || remainingMs <= 0) {
    return fail('timeout', ['deadline_elapsed'])
  }
  if (remainingMs > MAX_ROLE_DEADLINE_MS) {
    return fail('invalid_input', ['deadline_too_far'])
  }

  try {
    let rawOutput: unknown

    if (selection.status === 'deterministic_fallback') {
      const deterministicFallback = options.deterministicFallback
      if (!deterministicFallback) {
        return fail('no_eligible_model', ['deterministic_fallback_unavailable'])
      }
      rawOutput = await invokeWithDeadline({
        callerSignal: options.signal,
        deadlineAt,
        now,
        operation: signal =>
          Promise.resolve(
            deterministicFallback(trustedInput, {
              ownerScopeId: options.scope.ownerScopeId,
              executionId: options.scope.executionId,
              invocationId: options.scope.invocationId,
              role: options.role,
              signal
            })
          )
      })
    } else {
      let attempt = 1
      for (;;) {
        try {
          const response = await invokeWithDeadline({
            callerSignal: options.signal,
            deadlineAt,
            now,
            operation: signal =>
              options.adapter.invoke({
                ownerScopeId: options.scope.ownerScopeId,
                executionId: options.scope.executionId,
                invocationId: options.scope.invocationId,
                role: options.role,
                providerId: selection.candidate.providerId,
                modelId: selection.candidate.modelId,
                promptVersion: options.prompt.version,
                instruction: options.prompt.instruction,
                input: trustedInput,
                outputSchemaVersion: options.prompt.outputSchemaVersion,
                maxOutputBytes: options.limits.maxOutputBytes,
                maxOutputTokens: options.limits.maxOutputTokens,
                permissionClass,
                attempt,
                signal
              })
          })
          let parsedResponse: z.infer<typeof ProviderResponseSchema>
          try {
            parsedResponse = parseArchitectureContract(
              ProviderResponseSchema,
              response
            )
          } catch {
            throw new MalformedRoleProviderResponseError()
          }
          if (parsedResponse.outputTokens > options.limits.maxOutputTokens) {
            throw new RoleOutputLimitError()
          }
          rawOutput = parsedResponse.output
          break
        } catch (error) {
          if (!canRetry(error, permissionClass, retryPolicy, attempt))
            throw error
          const delay = Math.min(
            retryPolicy.initialDelayMs * 2 ** (attempt - 1),
            retryPolicy.maximumDelayMs
          )
          await invokeWithDeadline({
            callerSignal: options.signal,
            deadlineAt,
            now,
            operation: signal => cancellableDelay(delay, signal)
          })
          attempt += 1
        }
      }
    }

    let output: TOutput
    try {
      output = parseArchitectureContract(options.outputSchema, rawOutput)
    } catch {
      throw new MalformedRoleProviderResponseError()
    }
    const outputJson = canonicalJson(output)
    if (byteLength(outputJson) > options.limits.maxOutputBytes) {
      throw new RoleOutputLimitError()
    }

    return Object.freeze({
      request,
      result: buildResult({
        request,
        status: 'succeeded',
        startedAt,
        completedAt: readNow(now).toISOString(),
        outputDigest: digest(outputJson),
        failureClass: null,
        reasonCodes: [
          ...selection.reasonCodes,
          selection.status === 'deterministic_fallback'
            ? 'deterministic_fallback_completed'
            : 'role_output_validated'
        ]
      }),
      output
    })
  } catch (error) {
    const failureClass = classifyFailure(error)
    return fail(failureClass, [
      failureClass === 'cancelled'
        ? 'caller_cancelled'
        : failureClass === 'timeout'
          ? 'role_deadline_exceeded'
          : failureClass === 'malformed_output'
            ? 'role_output_rejected'
            : failureClass === 'transient_provider_failure'
              ? 'transient_provider_failure'
              : 'permanent_provider_failure'
    ])
  }
}
