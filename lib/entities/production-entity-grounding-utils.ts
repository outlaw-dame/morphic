import { createHash } from 'node:crypto'

import {
  EntityProviderResultSchema,
  type EntityProviderResult
} from '@/lib/ai/architecture/contracts'

import type {
  ClassifiedEntityFailure,
  EntityGroundingProviderOutcome,
  EntityProvider,
  GovernedEntityProviderPort,
  NormalizedEntityGroundingLimits
} from './production-entity-grounding-contract'
import type { EntityMention, KnowledgeGraphEntity } from './entity-types'

const DEFAULT_MAX_ATTEMPTS = 2
const DEFAULT_BASE_RETRY_DELAY_MS = 100
const DEFAULT_MAX_RETRY_DELAY_MS = 1_000

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  name: string
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid entity grounding ${name}.`)
  }
  return value
}

export function normalizeEntityGroundingLimits(value: {
  maxMentions: number
  maxCandidatesPerProvider: number
  maxResolvedEntities: number
  maxCanonicalIdsPerOutcome: number
  maxProviderCalls: number
  maxConcurrency: number
  perProviderTimeoutMs: number
  maxAttemptsPerProvider?: number
  baseRetryDelayMs?: number
  maxRetryDelayMs?: number
}): NormalizedEntityGroundingLimits {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid entity grounding limits.')
  }
  const limits = {
    maxMentions: boundedInteger(value.maxMentions, 1, 32, 'mention limit'),
    maxCandidatesPerProvider: boundedInteger(
      value.maxCandidatesPerProvider,
      1,
      16,
      'candidate limit'
    ),
    maxResolvedEntities: boundedInteger(
      value.maxResolvedEntities,
      1,
      32,
      'resolved entity limit'
    ),
    maxCanonicalIdsPerOutcome: boundedInteger(
      value.maxCanonicalIdsPerOutcome,
      1,
      32,
      'canonical identifier limit'
    ),
    maxProviderCalls: boundedInteger(
      value.maxProviderCalls,
      1,
      256,
      'provider call limit'
    ),
    maxConcurrency: boundedInteger(
      value.maxConcurrency,
      1,
      8,
      'concurrency limit'
    ),
    perProviderTimeoutMs: boundedInteger(
      value.perProviderTimeoutMs,
      100,
      30_000,
      'provider timeout'
    ),
    maxAttemptsPerProvider: boundedInteger(
      value.maxAttemptsPerProvider ?? DEFAULT_MAX_ATTEMPTS,
      1,
      3,
      'attempt limit'
    ),
    baseRetryDelayMs: boundedInteger(
      value.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS,
      0,
      10_000,
      'base retry delay'
    ),
    maxRetryDelayMs: boundedInteger(
      value.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS,
      0,
      30_000,
      'maximum retry delay'
    )
  }
  if (limits.baseRetryDelayMs > limits.maxRetryDelayMs) {
    throw new Error('Invalid entity grounding retry delay range.')
  }
  return Object.freeze(limits)
}

export function assertEntityProviderPort(
  port: GovernedEntityProviderPort,
  name: EntityProvider
): void {
  if (!port || typeof port !== 'object' || typeof port.search !== 'function') {
    throw new Error(`Invalid ${name} entity provider.`)
  }
}

export function validateEntityExecutionId(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length < 16 ||
    value.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new Error('Invalid entity grounding execution ID.')
  }
  return value
}

export function digestEntityValue(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

export function createEntityMentionId(
  routeDigest: string,
  mention: EntityMention
): string {
  return `mention_${createHash('sha256')
    .update(`${routeDigest}\n${mention.normalizedText.toLowerCase()}`)
    .digest('hex')
    .slice(0, 32)}`
}

export function throwIfEntityGroundingAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  const message =
    typeof signal.reason === 'string'
      ? signal.reason
      : 'Entity grounding was cancelled.'
  throw typeof DOMException === 'undefined'
    ? new Error(message)
    : new DOMException(message, 'AbortError')
}

export function boundedEntityReasonCodes(
  values: readonly string[]
): readonly string[] {
  return Object.freeze([...new Set(values)].slice(0, 32))
}

export function classifyEntityProviderFailure(
  error: unknown
): ClassifiedEntityFailure {
  const record =
    error && typeof error === 'object'
      ? (error as Record<string, unknown>)
      : undefined
  const status = typeof record?.status === 'number' ? record.status : undefined
  const code = typeof record?.code === 'string' ? record.code : undefined
  const name = error instanceof Error ? error.name : undefined

  if (status === 429) {
    return {
      failureClass: 'transient_provider_failure',
      reasonCode: 'provider_rate_limited',
      retryable: true
    }
  }
  if (status === 408 || name === 'TimeoutError' || code === 'ETIMEDOUT') {
    return {
      failureClass: 'timeout',
      reasonCode: 'provider_timeout',
      retryable: true
    }
  }
  if (
    (status !== undefined && status >= 500) ||
    code === 'ECONNRESET' ||
    code === 'EAI_AGAIN'
  ) {
    return {
      failureClass: 'transient_provider_failure',
      reasonCode:
        status !== undefined && status >= 500
          ? 'provider_server_error'
          : 'provider_network_failure',
      retryable: true
    }
  }
  if (status !== undefined && status >= 400) {
    return {
      failureClass: 'policy_violation',
      reasonCode: 'provider_deterministic_4xx',
      retryable: false
    }
  }
  if (name === 'AbortError') {
    return {
      failureClass: 'cancelled',
      reasonCode: 'provider_cancelled',
      retryable: false
    }
  }
  if (record?.failureClass === 'malformed_response') {
    return {
      failureClass: 'malformed_output',
      reasonCode: 'provider_malformed_response',
      retryable: false
    }
  }
  return {
    failureClass: 'permanent_provider_failure',
    reasonCode: 'provider_internal_failure',
    retryable: false
  }
}

export function entityRetryDelay(
  attempt: number,
  limits: NormalizedEntityGroundingLimits,
  random: () => number,
  error: unknown
): number {
  const record =
    error && typeof error === 'object'
      ? (error as Record<string, unknown>)
      : undefined
  if (
    typeof record?.retryAfterMs === 'number' &&
    Number.isFinite(record.retryAfterMs) &&
    record.retryAfterMs >= 0
  ) {
    return Math.min(record.retryAfterMs, limits.maxRetryDelayMs)
  }
  const exponential = Math.min(
    limits.maxRetryDelayMs,
    limits.baseRetryDelayMs * 2 ** (attempt - 1)
  )
  const jitter = 0.5 + Math.max(0, Math.min(1, random())) * 0.5
  return Math.floor(exponential * jitter)
}

export function sleepForEntityRetry(
  milliseconds: number,
  signal?: AbortSignal
): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(
        signal?.reason ??
          new Error('Entity grounding retry was cancelled.')
      )
    }
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function createEntityTimeout(
  parent: AbortSignal | undefined,
  milliseconds: number
): Readonly<{ signal: AbortSignal; dispose(): void; timedOut(): boolean }> {
  const controller = new AbortController()
  let didTimeout = false
  const timer = setTimeout(() => {
    didTimeout = true
    const error = new Error('Entity provider request timed out.')
    error.name = 'TimeoutError'
    controller.abort(error)
  }, milliseconds)
  const onAbort = () => controller.abort(parent?.reason)
  if (parent?.aborted) onAbort()
  else parent?.addEventListener('abort', onAbort, { once: true })
  return Object.freeze({
    signal: controller.signal,
    dispose() {
      clearTimeout(timer)
      parent?.removeEventListener('abort', onAbort)
    },
    timedOut: () => didTimeout
  })
}

function malformedEntityProviderOutput(message: string): Error {
  return Object.assign(new Error(message), {
    failureClass: 'malformed_response'
  })
}

export function validateEntityCandidates(
  value: readonly KnowledgeGraphEntity[],
  provider: EntityProvider,
  maximum: number
): readonly KnowledgeGraphEntity[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw malformedEntityProviderOutput(
      'Entity provider returned an invalid candidate set.'
    )
  }
  return Object.freeze(
    value.map(candidate => {
      const label =
        typeof candidate?.label === 'string' ? candidate.label.trim() : ''
      const matchedText =
        typeof candidate?.matchedText === 'string'
          ? candidate.matchedText.trim()
          : ''
      if (
        !label ||
        label.length > 256 ||
        !matchedText ||
        matchedText.length > 256 ||
        typeof candidate.confidence !== 'number' ||
        !Number.isFinite(candidate.confidence) ||
        candidate.confidence < 0 ||
        candidate.confidence > 1 ||
        candidate.source !== provider
      ) {
        throw malformedEntityProviderOutput(
          'Entity provider returned a malformed candidate.'
        )
      }
      return Object.freeze({ ...candidate, label, matchedText })
    })
  )
}

export function canonicalEntityIds(
  candidates: readonly KnowledgeGraphEntity[],
  maximum: number
): readonly string[] {
  const values = candidates.flatMap(candidate => {
    const identifier = candidate.wikidataId ?? candidate.dbpediaUri
    return identifier ? [identifier] : []
  })
  return Object.freeze([...new Set(values)].slice(0, maximum))
}

export function missingCanonicalEntityIdError(): Error {
  return malformedEntityProviderOutput(
    'Entity provider candidates lacked canonical identifiers.'
  )
}

export function createEntityProviderOutcome(
  executionId: string,
  value: Omit<EntityGroundingProviderOutcome, 'version' | 'executionId'>
): EntityGroundingProviderOutcome {
  const parsed: EntityProviderResult = EntityProviderResultSchema.parse({
    version: 1,
    executionId,
    provider: value.provider,
    mentionId: value.mentionId,
    status: value.status,
    canonicalIds: value.canonicalIds,
    resultDigest: value.resultDigest,
    retrievedAt: value.retrievedAt,
    failureClass: value.failureClass,
    reasonCodes: value.reasonCodes
  })
  return Object.freeze({
    ...parsed,
    attempts: value.attempts,
    networkCallStarted: value.networkCallStarted
  })
}
