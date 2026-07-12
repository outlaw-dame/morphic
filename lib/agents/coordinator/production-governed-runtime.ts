import { randomUUID } from 'node:crypto'

import type { RouteExecutionContext } from '@/lib/ai/router/execution-context'
import {
  createTrustedRoleExecutionScope,
  type RoleProviderAdapter,
  type RoleRunnerLimits
} from '@/lib/ai/role-runner'

import {
  runProductionGovernedChain,
  type ProductionGovernedChainInput
} from './production-governed-chain'
import {
  createProductionAdvisorAdapter,
  type AdvisorModelInput
} from './production-advisor-adapter'
import {
  createProductionCitationVerifierAdapter,
  type CitationVerifierModelInput
} from './production-citation-verifier-adapter'
import {
  createProductionCompositionAdapter,
  type ComposerModelInput
} from './production-composition-adapter'
import {
  createProductionRetrievalAdapter,
  type ProductionRetrievalExecutor
} from './production-retrieval-adapter'

const DEFAULT_DEADLINE_MS = 120_000
const MIN_DEADLINE_MS = 1_000
const MAX_DEADLINE_MS = 10 * 60 * 1_000

export type GovernedRoleRuntimeConfiguration<TInput> = Readonly<{
  candidates: readonly unknown[]
  provider: RoleProviderAdapter<TInput>
  limits?: RoleRunnerLimits
}>

export type ProductionGovernedRuntimeConfiguration = Readonly<{
  ownerScopeId: string
  executionId?: string
  deadlineMs?: number
  retrievalExecutor: ProductionRetrievalExecutor
  composer: GovernedRoleRuntimeConfiguration<ComposerModelInput>
  advisor?: GovernedRoleRuntimeConfiguration<AdvisorModelInput>
  citationVerifier: GovernedRoleRuntimeConfiguration<CitationVerifierModelInput>
}>

export type ProductionGovernedRuntime = Readonly<{
  executionId: string
  deadlineAt: string
  run(input: Readonly<{
    query: string
    routeContext: RouteExecutionContext
    maxRetrievalAttempts?: number
    signal?: AbortSignal
    now?: Date
    authorizationTtlMs?: number
  }>): ReturnType<typeof runProductionGovernedChain>
}>

function readDeadlineMs(value: number | undefined): number {
  const deadlineMs = value ?? DEFAULT_DEADLINE_MS
  if (
    !Number.isSafeInteger(deadlineMs) ||
    deadlineMs < MIN_DEADLINE_MS ||
    deadlineMs > MAX_DEADLINE_MS
  ) {
    throw new Error('Invalid governed runtime deadline.')
  }
  return deadlineMs
}

function readExecutionId(value: string | undefined): string {
  const executionId = value ?? randomUUID()
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(executionId)) {
    throw new Error('Invalid governed runtime execution ID.')
  }
  return executionId
}

function assertRoleConfiguration<TInput>(
  value: GovernedRoleRuntimeConfiguration<TInput> | undefined,
  name: string
): asserts value is GovernedRoleRuntimeConfiguration<TInput> {
  if (!value || typeof value !== 'object') {
    throw new Error(`Invalid governed ${name} configuration.`)
  }
  if (!Array.isArray(value.candidates) || value.candidates.length === 0) {
    throw new Error(`Invalid governed ${name} candidates.`)
  }
  const provider = value.provider
  if (!provider || typeof provider !== 'object') {
    throw new Error(`Invalid governed ${name} provider.`)
  }
  const descriptor = Object.getOwnPropertyDescriptor(provider, 'invoke')
  if (!descriptor || typeof descriptor.value !== 'function') {
    throw new Error(`Invalid governed ${name} provider.`)
  }
}

export function createProductionGovernedRuntime(
  configuration: ProductionGovernedRuntimeConfiguration
): ProductionGovernedRuntime {
  if (!configuration || typeof configuration !== 'object') {
    throw new Error('Invalid governed runtime configuration.')
  }
  if (typeof configuration.retrievalExecutor?.execute !== 'function') {
    throw new Error('Invalid governed retrieval executor.')
  }

  assertRoleConfiguration(configuration.composer, 'Composer')
  assertRoleConfiguration(configuration.citationVerifier, 'Citation Verifier')
  if (configuration.advisor !== undefined) {
    assertRoleConfiguration(configuration.advisor, 'Advisor')
  }

  const executionId = readExecutionId(configuration.executionId)
  const deadlineAt = new Date(Date.now() + readDeadlineMs(configuration.deadlineMs))
  if (!Number.isFinite(deadlineAt.getTime())) {
    throw new Error('Invalid governed runtime deadline.')
  }
  const deadlineAtIso = deadlineAt.toISOString()

  const composition = createProductionCompositionAdapter({
    scope: createTrustedRoleExecutionScope({
      ownerScopeId: configuration.ownerScopeId,
      executionId,
      invocationId: randomUUID(),
      deadlineAt: deadlineAtIso,
      allowedPermissionClasses: ['none']
    }),
    candidates: configuration.composer.candidates,
    provider: configuration.composer.provider,
    ...(configuration.composer.limits
      ? { limits: configuration.composer.limits }
      : {})
  })

  const advisor = configuration.advisor
    ? createProductionAdvisorAdapter({
        scope: createTrustedRoleExecutionScope({
          ownerScopeId: configuration.ownerScopeId,
          executionId,
          invocationId: randomUUID(),
          deadlineAt: deadlineAtIso,
          allowedPermissionClasses: ['none']
        }),
        candidates: configuration.advisor.candidates,
        provider: configuration.advisor.provider,
        ...(configuration.advisor.limits
          ? { limits: configuration.advisor.limits }
          : {})
      })
    : undefined

  const citationVerifier = createProductionCitationVerifierAdapter({
    scope: createTrustedRoleExecutionScope({
      ownerScopeId: configuration.ownerScopeId,
      executionId,
      invocationId: randomUUID(),
      deadlineAt: deadlineAtIso,
      allowedPermissionClasses: ['evidence_read_only']
    }),
    candidates: configuration.citationVerifier.candidates,
    provider: configuration.citationVerifier.provider,
    ...(configuration.citationVerifier.limits
      ? { limits: configuration.citationVerifier.limits }
      : {})
  })

  const retrieval = createProductionRetrievalAdapter(
    configuration.retrievalExecutor
  )

  return Object.freeze({
    executionId,
    deadlineAt: deadlineAtIso,
    run(input) {
      if (!input || typeof input !== 'object') {
        throw new Error('Invalid governed runtime input.')
      }
      const chainInput: ProductionGovernedChainInput = {
        query: input.query,
        routeContext: input.routeContext,
        retrieval,
        composition,
        ...(advisor ? { advisor } : {}),
        citationVerifier,
        ...(input.maxRetrievalAttempts === undefined
          ? {}
          : { maxRetrievalAttempts: input.maxRetrievalAttempts }),
        ...(input.signal ? { signal: input.signal } : {}),
        ...(input.now ? { now: input.now } : {}),
        ...(input.authorizationTtlMs === undefined
          ? {}
          : { authorizationTtlMs: input.authorizationTtlMs })
      }
      return runProductionGovernedChain(chainInput)
    }
  })
}
