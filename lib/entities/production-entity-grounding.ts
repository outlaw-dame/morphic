import { createHash } from 'node:crypto'

import {
  EntityProviderResultSchema,
  type EntityProviderResult
} from '@/lib/ai/architecture/contracts'
import {
  createRouteExecutionContext,
  type RouteExecutionContext
} from '@/lib/ai/router/execution-context'
import type { SearchResultItem } from '@/lib/types'

import { extractEntityMentions } from './entity-extraction'
import { resolveEntities } from './entity-resolution'
import type {
  EntityMention,
  KnowledgeGraphEntity,
  ResolvedEntity
} from './entity-types'

const PROVIDERS = ['wikidata', 'dbpedia'] as const
const MAX_QUERY_LENGTH = 16_000
const MAX_EXECUTION_ID_LENGTH = 128
const MAX_REASON_CODE_LENGTH = 128
const DEFAULT_MAX_ATTEMPTS = 2
const DEFAULT_BASE_RETRY_DELAY_MS = 100
const DEFAULT_MAX_RETRY_DELAY_MS = 1_000

type EntityProvider = (typeof PROVIDERS)[number]

type ProviderSearchInput = Readonly<{
  query: string
  maxResults: number
  signal: AbortSignal
}>

export type GovernedEntityProviderPort = Readonly<{
  search(input: ProviderSearchInput): Promise<readonly KnowledgeGraphEntity[]>
}>

export type EntityGroundingLimits = Readonly<{
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
}>

export type ProductionEntityGroundingConfiguration = Readonly<{
  executionId: string
  wikidata: GovernedEntityProviderPort
  dbpedia: GovernedEntityProviderPort
  limits: EntityGroundingLimits
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  random?: () => number
  now?: () => Date
}>

export type EntityGroundingProviderOutcome = EntityProviderResult &
  Readonly<{
    attempts: number
    networkCallStarted: boolean
  }>

export type ProductionEntityGroundingReport = Readonly<{
  routeDigest: string
  executionId: string
  mentions: readonly EntityMention[]
  outcomes: readonly EntityGroundingProviderOutcome[]
  resolvedEntities: readonly ResolvedEntity[]
  unresolvedMentionIds: readonly string[]
  ambiguousMentionIds: readonly string[]
  completed: boolean
  reasonCodes: readonly string[]
  budget: Readonly<{
    providerCallsUsed: number
    providerCallsAllowed: number
  }>
}>

export type ProductionEntityGroundingAdapter = Readonly<{
  ground(input: Readonly<{
    query: string
    results: readonly SearchResultItem[]
    routeContext: RouteExecutionContext
    signal?: AbortSignal
  }>): Promise<ProductionEntityGroundingReport>
}>

type FailureClass = NonNullable<EntityProviderResult['failureClass']>

type ProviderTask = Readonly<{
  provider: EntityProvider
  mention: EntityMention
  mentionId: string
}>

type ProviderExecution = Readonly<{
  outcome: EntityGroundingProviderOutcome
  candidates: readonly KnowledgeGraphEntity[]
}>

function assertSafeInteger(
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

function normalizeLimits(limits: EntityGroundingLimits): Required<EntityGroundingLimits> {
  if (!limits || typeof limits !== 'object') {
    throw new Error('Invalid entity grounding limits.')
  }

  const normalized = {
    maxMentions: assertSafeInteger(limits.maxMentions, 1, 32, 'mention limit'),
    maxCandidatesPerProvider: assertSafeInteger(
      limits.maxCandidatesPerProvider,
      1,
      16,
      'candidate limit'
    ),
    maxResolvedEntities: assertSafeInteger(
      limits.maxResolvedEntities,
      1,
      32,
      'resolved entity limit'
    ),
    maxCanonicalIdsPerOutcome: assertSafeInteger(
      limits.maxCanonicalIdsPerOutcome,
      1,
      64,
      'canonical identifier limit'
    ),
    maxProviderCalls: assertSafeInteger(
      limits.maxProviderCalls,
      1,
      256,
      'provider call limit'
    ),
    maxConcurrency: assertSafeInteger(
      limits.maxConcurrency,
      1,
      8,
      'concurrency limit'
    ),
    perProviderTimeoutMs: assertSafeInteger(
      limits.perProviderTimeoutMs,
      100,
      30_000,
      'provider timeout'
    ),
    maxAttemptsPerProvider: assertSafeInteger(
      limits.maxAttemptsPerProvider ?? DEFAULT_MAX_ATTEMPTS,
      1,
      3,
      'attempt limit'
    ),
    baseRetryDelayMs: assertSafeInteger(
      limits.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS,
      0,
      10_000,
      'base retry delay'
    ),
    maxRetryDelayMs: assertSafeInteger(
      limits.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS,
      0,
      30_000,
      'maximum retry delay'
    )
  }

  if (normalized.baseRetryDelayMs > normalized.maxRetryDelayMs) {
    throw new Error('Invalid entity grounding retry delay range.')
  }

  return Object.freeze(normalized)
}

function assertProviderPort(
  value: GovernedEntityProviderPort,
  provider: EntityProvider
): void {
  if (!value || typeof value !== 'object') {
    throw new Error(`Invalid ${provider} entity provider.`)
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, 'search')
  if (!descriptor || typeof descriptor.value !== 'function') {
    throw new Error(`Invalid ${provider} entity provider.`)
  }
}

function validateExecutionId(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length < 16 ||
    value.length > MAX_EXECUTION_ID_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new Error('Invalid entity grounding execution ID.')
  }
  return value
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function mentionId(routeDigest: string, mention: EntityMention): string {
  return `mention_${createHash('sha256')
    .update(`${routeDigest}\n${mention.normalizedText.toLowerCase()}`)
    .digest('hex')
    .slice(0, 32)}`
}

function canonicalIds(
  candidates: readonly KnowledgeGraphEntity[],
  maximum: number
): readonly string[] {
  const ids: string[] = []
  for (const candidate of candidates) {
    const identifier = candidate.wikidataId ?? candidate.dbpediaUri
    if (!identifier || ids.includes(identifier)) continue
    ids.push(identifier)
    if (ids.length >= maximum) break
  }
  return Object.freeze(ids)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  const message =
    typeof signal.reason === 'string'
      ? signal.reason
      : 'Entity grounding was cancelled.'
  throw typeof DOMException !== 'undefined'
    ? new DOMException(message, 'AbortError')
    : new Error(message)
}

function boundedReasonCodes(values: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(values)]
      .filter(
        value =>
          typeof value === 'string' &&
          value.length > 0 &&
          value.length <= MAX_REASON_CODE_LENGTH
      )
      .slice(0, 64)
  )
}

function classifyFailure(error: unknown): Readonly<{
  failureClass: FailureClass
  reasonCode: string
  retryable: boolean
}> {
  const record =
    error && typeof error === 'object'
      ? (error as Record<string, unknown>)
      : undefined
  const status = typeof record?.status === 'number' ? record.status : undefined
  const code = typeof record?.code === 'string' ? record.code : undefined
  const name = error instanceof Error ? error.name : undefined

  if (status === 429) {
    return {
      failureClass: 'rate_limited',
      reasonCode: 'provider_rate_limited',
      retryable: true
    }
  }
  if (status === 408 || (status !== undefined && status >= 500)) {
    return {
      failureClass: status === 408 ? 'timeout' : 'network',
      reasonCode: status === 408 ? 'provider_timeout' : 'provider_server_error',
      retryable: true
    }
  }
  if (status !== undefined && status >= 400 && status < 500) {
    return {
      failureClass: 'policy',
      reasonCode: 'provider_deterministic_4xx',
      retryable: false
    }
  }
  if (name === 'TimeoutError' || code === 'ETIMEDOUT') {
    return {
      failureClass: 'timeout',
      reasonCode: 'provider_timeout',
      retryable: true
    }
  }
  if (code === 'ECONNRESET' || code === 'EAI_AGAIN') {
    return {
      failureClass: 'network',
      reasonCode: 'provider_network_failure',
      retryable: true
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
      failureClass: 'malformed_response',
      reasonCode: 'provider_malformed_response',
      retryable: false
    }
  }
  return {
    failureClass: 'internal',
    reasonCode: 'provider_internal_failure',
    retryable: false
  }
}

function retryDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number,
  error: unknown
): number {
  const record =
    error && typeof error === 'object'
      ? (error as Record<string, unknown>)
      : undefined
  const retryAfterMs =
    typeof record?.retryAfterMs === 'number' &&
    Number.isFinite(record.retryAfterMs) &&
    record.retryAfterMs >= 0
      ? Math.min(record.retryAfterMs, maxDelayMs)
      : undefined
  if (retryAfterMs !== undefined) return retryAfterMs

  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
  return Math.floor(exponential * (0.5 + Math.max(0, Math.min(1, random())) * 0.5))
}

function defaultSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason ?? new Error('Entity grounding retry was cancelled.'))
      },
      { once: true }
    )
  })
}

function withTimeout(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number
): Readonly<{ signal: AbortSignal; dispose(): void; timedOut(): boolean }> {
  const controller = new AbortController()
  let didTimeout = false
  const timeout = setTimeout(() => {
    didTimeout = true
    const error = new Error('Entity provider request timed out.')
    error.name = 'TimeoutError'
    controller.abort(error)
  }, timeoutMs)

  const abortFromParent = () => controller.abort(parentSignal?.reason)
  if (parentSignal) {
    if (parentSignal.aborted) abortFromParent()
    else parentSignal.addEventListener('abort', abortFromParent, { once: true })
  }

  return Object.freeze({
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout)
      parentSignal?.removeEventListener('abort', abortFromParent)
    },
    timedOut() {
      return didTimeout
    }
  })
}

function validateCandidates(
  value: readonly KnowledgeGraphEntity[],
  provider: EntityProvider,
  maximum: number
): readonly KnowledgeGraphEntity[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw Object.assign(new Error('Entity provider returned an invalid candidate set.'), {
      failureClass: 'malformed_response'
    })
  }

  const candidates: KnowledgeGraphEntity[] = []
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') {
      throw Object.assign(new Error('Entity provider returned a malformed candidate.'), {
        failureClass: 'malformed_response'
      })
    }
    const label = typeof candidate.label === 'string' ? candidate.label.trim() : ''
    const matchedText =
      typeof candidate.matchedText === 'string' ? candidate.matchedText.trim() : ''
    const confidence = candidate.confidence
    if (
      !label ||
      label.length > 256 ||
      !matchedText ||
      matchedText.length > 256 ||
      typeof confidence !== 'number' ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1 ||
      candidate.source !== provider
    ) {
      throw Object.assign(new Error('Entity provider returned a malformed candidate.'), {
        failureClass: 'malformed_response'
      })
    }
    candidates.push(Object.freeze({ ...candidate, label, matchedText }))
  }
  return Object.freeze(candidates)
}

function createOutcome(
  value: Omit<EntityGroundingProviderOutcome, 'version' | 'executionId'>,
  executionId: string
): EntityGroundingProviderOutcome {
  const parsed = EntityProviderResultSchema.parse({
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

export function createProductionEntityGroundingAdapter(
  configuration: ProductionEntityGroundingConfiguration
): ProductionEntityGroundingAdapter {
  if (!configuration || typeof configuration !== 'object') {
    throw new Error('Invalid entity grounding configuration.')
  }
  const executionId = validateExecutionId(configuration.executionId)
  assertProviderPort(configuration.wikidata, 'wikidata')
  assertProviderPort(configuration.dbpedia, 'dbpedia')
  const limits = normalizeLimits(configuration.limits)
  const sleep = configuration.sleep ?? defaultSleep
  const random = configuration.random ?? Math.random
  const now = configuration.now ?? (() => new Date())
  if (typeof sleep !== 'function' || typeof random !== 'function' || typeof now !== 'function') {
    throw new Error('Invalid entity grounding runtime dependency.')
  }

  const ports = Object.freeze({
    wikidata: configuration.wikidata,
    dbpedia: configuration.dbpedia
  })

  return Object.freeze({
    async ground(input) {
      const query = typeof input?.query === 'string' ? input.query.trim() : ''
      if (!query || query.length > MAX_QUERY_LENGTH) {
        throw new Error('Invalid entity grounding query.')
      }
      if (!Array.isArray(input.results)) {
        throw new Error('Invalid entity grounding search results.')
      }
      const routeContext = createRouteExecutionContext(input.routeContext)
      if (!routeContext.routePlan.needsEntityGrounding) {
        throw new Error('Router did not authorize entity grounding.')
      }
      throwIfAborted(input.signal)

      const mentions = Object.freeze(
        extractEntityMentions(query, [...input.results], limits.maxMentions).map(
          mention => Object.freeze({ ...mention })
        )
      )
      const tasks: ProviderTask[] = []
      for (const mention of mentions) {
        const id = mentionId(routeContext.routeDigest, mention)
        for (const provider of PROVIDERS) {
          tasks.push(Object.freeze({ provider, mention, mentionId: id }))
        }
      }

      if (tasks.length > limits.maxProviderCalls) {
        throw new Error('Entity grounding provider call budget exceeded before execution.')
      }

      let providerCallsUsed = 0
      let nextTaskIndex = 0
      const executions: ProviderExecution[] = []

      const executeTask = async (task: ProviderTask): Promise<ProviderExecution> => {
        if (input.signal?.aborted) {
          return {
            candidates: Object.freeze([]),
            outcome: createOutcome(
              {
                provider: task.provider,
                mentionId: task.mentionId,
                status: 'cancelled',
                canonicalIds: [],
                resultDigest: null,
                retrievedAt: now().toISOString(),
                failureClass: 'cancelled',
                reasonCodes: boundedReasonCodes(['cancelled_before_provider_start']),
                attempts: 0,
                networkCallStarted: false
              },
              executionId
            )
          }
        }

        let attempts = 0
        let networkCallStarted = false
        let lastFailure: ReturnType<typeof classifyFailure> | undefined

        while (attempts < limits.maxAttemptsPerProvider) {
          throwIfAborted(input.signal)
          if (providerCallsUsed >= limits.maxProviderCalls) {
            lastFailure = {
              failureClass: 'policy',
              reasonCode: 'provider_call_budget_exhausted',
              retryable: false
            }
            break
          }

          providerCallsUsed += 1
          attempts += 1
          networkCallStarted = true
          const timeout = withTimeout(input.signal, limits.perProviderTimeoutMs)
          try {
            const raw = await ports[task.provider].search({
              query: task.mention.normalizedText,
              maxResults: limits.maxCandidatesPerProvider,
              signal: timeout.signal
            })
            const candidates = validateCandidates(
              raw,
              task.provider,
              limits.maxCandidatesPerProvider
            )
            const ids = canonicalIds(candidates, limits.maxCanonicalIdsPerOutcome)
            const retrievedAt = now().toISOString()
            if (candidates.length === 0) {
              return {
                candidates,
                outcome: createOutcome(
                  {
                    provider: task.provider,
                    mentionId: task.mentionId,
                    status: 'not_found',
                    canonicalIds: [],
                    resultDigest: null,
                    retrievedAt,
                    failureClass: null,
                    reasonCodes: boundedReasonCodes(['provider_returned_no_candidates']),
                    attempts,
                    networkCallStarted
                  },
                  executionId
                )
              }
            }
            if (ids.length === 0) {
              throw Object.assign(
                new Error('Entity provider candidates lacked canonical identifiers.'),
                { failureClass: 'malformed_response' }
              )
            }
            return {
              candidates,
              outcome: createOutcome(
                {
                  provider: task.provider,
                  mentionId: task.mentionId,
                  status: 'succeeded',
                  canonicalIds: ids,
                  resultDigest: sha256(JSON.stringify(candidates)),
                  retrievedAt,
                  failureClass: null,
                  reasonCodes: boundedReasonCodes(['provider_candidates_validated']),
                  attempts,
                  networkCallStarted
                },
                executionId
              )
            }
          } catch (error) {
            if (input.signal?.aborted) throwIfAborted(input.signal)
            lastFailure = timeout.timedOut()
              ? {
                  failureClass: 'timeout',
                  reasonCode: 'provider_timeout',
                  retryable: true
                }
              : classifyFailure(error)
            if (
              !lastFailure.retryable ||
              attempts >= limits.maxAttemptsPerProvider ||
              providerCallsUsed >= limits.maxProviderCalls
            ) {
              break
            }
            await sleep(
              retryDelay(
                attempts,
                limits.baseRetryDelayMs,
                limits.maxRetryDelayMs,
                random,
                error
              ),
              input.signal
            )
          } finally {
            timeout.dispose()
          }
        }

        const failure =
          lastFailure ??
          ({
            failureClass: 'internal',
            reasonCode: 'provider_internal_failure',
            retryable: false
          } as const)
        return {
          candidates: Object.freeze([]),
          outcome: createOutcome(
            {
              provider: task.provider,
              mentionId: task.mentionId,
              status: 'failed',
              canonicalIds: [],
              resultDigest: null,
              retrievedAt: now().toISOString(),
              failureClass: failure.failureClass,
              reasonCodes: boundedReasonCodes([failure.reasonCode]),
              attempts,
              networkCallStarted
            },
            executionId
          )
        }
      }

      const worker = async () => {
        while (true) {
          const index = nextTaskIndex
          nextTaskIndex += 1
          const task = tasks[index]
          if (!task) return
          executions[index] = await executeTask(task)
        }
      }

      await Promise.all(
        Array.from(
          { length: Math.min(limits.maxConcurrency, Math.max(1, tasks.length)) },
          () => worker()
        )
      )
      throwIfAborted(input.signal)

      const candidates = executions.flatMap(execution => execution.candidates)
      const resolvedEntities = Object.freeze(
        resolveEntities([...mentions], candidates, limits.maxResolvedEntities).map(
          entity => Object.freeze({ ...entity })
        )
      )
      const outcomes = Object.freeze(executions.map(execution => execution.outcome))
      const unresolvedMentionIds: string[] = []
      const ambiguousMentionIds: string[] = []

      for (const mention of mentions) {
        const id = mentionId(routeContext.routeDigest, mention)
        const matching = resolvedEntities.filter(entity =>
          entity.supportingMentions.some(
            supporting =>
              supporting.normalizedText.toLowerCase() ===
              mention.normalizedText.toLowerCase()
          )
        )
        if (matching.length === 0) unresolvedMentionIds.push(id)
        if (matching.some(entity => entity.ambiguous)) ambiguousMentionIds.push(id)
      }

      const completed =
        mentions.length > 0 &&
        unresolvedMentionIds.length === 0 &&
        ambiguousMentionIds.length === 0 &&
        outcomes.length === tasks.length
      const reasonCodes = boundedReasonCodes([
        completed ? 'entity_grounding_completed' : 'entity_grounding_blocked',
        ...(unresolvedMentionIds.length > 0 ? ['required_entity_unresolved'] : []),
        ...(ambiguousMentionIds.length > 0 ? ['required_entity_ambiguous'] : [])
      ])

      return Object.freeze({
        routeDigest: routeContext.routeDigest,
        executionId,
        mentions,
        outcomes,
        resolvedEntities,
        unresolvedMentionIds: Object.freeze(unresolvedMentionIds),
        ambiguousMentionIds: Object.freeze(ambiguousMentionIds),
        completed,
        reasonCodes,
        budget: Object.freeze({
          providerCallsUsed,
          providerCallsAllowed: limits.maxProviderCalls
        })
      })
    }
  })
}
