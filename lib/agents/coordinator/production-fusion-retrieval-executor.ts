import { createHash } from 'node:crypto'

import {
  createRouteExecutionContext,
  type RouteExecutionContext
} from '@/lib/ai/router/execution-context'
import type { ModelRole } from '@/lib/ai/schemas'
import type { SearchResultItem, SearchResults } from '@/lib/types'

import type {
  FusionRetrievalExecutionReport,
  FusionRetrievalPathOutcome
} from './governed-pipeline'
import type {
  ProductionFusionPath,
  ProductionFusionPlanner
} from './production-fusion-planner-adapter'
import type { ProductionRetrievalExecutor } from './production-retrieval-adapter'
import type { ProductionSearchPort } from './production-search-retrieval-executor'

const MAX_QUERY_LENGTH = 16_000
const MAX_ATTEMPTS = 5
const MAX_CONCURRENCY = 8
const DEFAULT_CONCURRENCY = 3
const MIN_PATH_TIMEOUT_MS = 250
const MAX_PATH_TIMEOUT_MS = 60_000
const DEFAULT_PATH_TIMEOUT_MS = 10_000
const MAX_RETRIEVAL_ATTEMPTS = 2
const MAX_TOTAL_RESULTS = 500
const MAX_ERROR_CLASS_LENGTH = 128
const MAX_RETRY_AFTER_MS = 5_000

const COMPLETED_ROLES: readonly ModelRole[] = Object.freeze([
  'router',
  'fusion_planner',
  'retriever'
])

export type ProductionFusionRetrievalExecutorOptions = Readonly<{
  planner: ProductionFusionPlanner
  searchPort: ProductionSearchPort
  maxConcurrency?: number
  perPathTimeoutMs?: number
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>
  random?: () => number
  now?: () => Date
}>

type ToolBudget = {
  used: number
  readonly allowed: number
}

type PathExecution = Readonly<{
  path: ProductionFusionPath
  outcome: FusionRetrievalPathOutcome
  results: readonly SearchResultItem[]
}>

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  const message =
    typeof signal.reason === 'string'
      ? signal.reason
      : 'The Fusion retrieval operation was aborted.'
  throw typeof DOMException !== 'undefined'
    ? new DOMException(message, 'AbortError')
    : Object.assign(new Error(message), { name: 'AbortError' })
}

function readBoundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  error: string
): number {
  const selected = value ?? fallback
  if (
    !Number.isSafeInteger(selected) ||
    selected < minimum ||
    selected > maximum
  ) {
    throw new Error(error)
  }
  return selected
}

function readNow(now?: () => Date): () => Date {
  if (now === undefined) return () => new Date()
  if (typeof now !== 'function') throw new Error('Invalid Fusion retrieval clock.')
  return () => {
    const value = now()
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new Error('Invalid Fusion retrieval clock value.')
    }
    return new Date(value.getTime())
  }
}

function readRandom(random?: () => number): () => number {
  if (random === undefined) return Math.random
  if (typeof random !== 'function') {
    throw new Error('Invalid Fusion retrieval random source.')
  }
  return () => {
    const value = random()
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error('Invalid Fusion retrieval random value.')
    }
    return value
  }
}

function defaultSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal)
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      try {
        throwIfAborted(signal)
      } catch (error) {
        reject(error)
      }
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function readSleep(
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>
): (delayMs: number, signal?: AbortSignal) => Promise<void> {
  if (sleep === undefined) return defaultSleep
  if (typeof sleep !== 'function') {
    throw new Error('Invalid Fusion retrieval sleep function.')
  }
  return sleep
}

function canonicalizeUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.username = ''
    url.password = ''
    url.hash = ''
    url.hostname = url.hostname.toLowerCase()
    if (
      (url.protocol === 'http:' && url.port === '80') ||
      (url.protocol === 'https:' && url.port === '443')
    ) {
      url.port = ''
    }
    const sorted = [...url.searchParams.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    )
    url.search = ''
    for (const [key, valuePart] of sorted) url.searchParams.append(key, valuePart)
    return url.toString()
  } catch {
    return null
  }
}

function normalizeErrorClass(error: unknown): string {
  if (
    error instanceof Error &&
    typeof error.name === 'string' &&
    error.name.length > 0
  ) {
    return error.name.slice(0, MAX_ERROR_CLASS_LENGTH)
  }
  return 'UnknownError'
}

function readRecord(error: unknown): Record<string, unknown> | null {
  return error && typeof error === 'object'
    ? (error as Record<string, unknown>)
    : null
}

function readStatus(error: unknown): number | null {
  const candidate = readRecord(error)
  return candidate && Number.isSafeInteger(candidate.status)
    ? (candidate.status as number)
    : null
}

function readCode(error: unknown): string | null {
  const candidate = readRecord(error)
  return candidate && typeof candidate.code === 'string'
    ? candidate.code
    : null
}

function readRetryAfterMs(error: unknown): number | null {
  const candidate = readRecord(error)
  if (!candidate) return null
  const value = candidate.retryAfterMs
  if (!Number.isSafeInteger(value) || (value as number) < 0) return null
  return Math.min(value as number, MAX_RETRY_AFTER_MS)
}

function isTransientFailure(error: unknown): boolean {
  const candidate = readRecord(error)
  if (!candidate) return false
  if (candidate.retryable === true) return true
  const status = readStatus(error)
  if (status === 408 || status === 429 || (status !== null && status >= 500)) {
    return true
  }
  if (error instanceof Error && error.name === 'TimeoutError') return true
  return new Set(['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN']).has(
    readCode(error) ?? ''
  )
}

function retryDelayMs(
  attempt: number,
  error: unknown,
  random: () => number
): number {
  const exponential = Math.min(1_000, 100 * 2 ** Math.max(0, attempt - 1))
  const jittered = exponential + Math.floor(random() * 50)
  return Math.max(jittered, readRetryAfterMs(error) ?? 0)
}

function combineAbortSignals(
  parent: AbortSignal | undefined,
  timeoutMs: number
): Readonly<{ signal: AbortSignal; cleanup: () => void }> {
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(parent?.reason)
  if (parent?.aborted) abortFromParent()
  else parent?.addEventListener('abort', abortFromParent, { once: true })

  const timeout = setTimeout(() => {
    controller.abort(
      typeof DOMException !== 'undefined'
        ? new DOMException('Fusion retrieval path timed out.', 'TimeoutError')
        : Object.assign(new Error('Fusion retrieval path timed out.'), {
            name: 'TimeoutError'
          })
    )
  }, timeoutMs)

  return Object.freeze({
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout)
      parent?.removeEventListener('abort', abortFromParent)
    }
  })
}

function consumeToolBudget(budget: ToolBudget): boolean {
  if (budget.used >= budget.allowed) return false
  budget.used += 1
  return true
}

function normalizePathResults(
  value: SearchResults,
  path: ProductionFusionPath,
  routeDigest: string,
  retrievedAt: string
): readonly SearchResultItem[] {
  if (!value || typeof value !== 'object' || !Array.isArray(value.results)) {
    throw new Error('Invalid Fusion search response.')
  }

  const normalized: SearchResultItem[] = []
  for (const candidate of value.results.slice(0, path.maxResults)) {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      typeof candidate.title !== 'string' ||
      typeof candidate.url !== 'string' ||
      typeof candidate.content !== 'string' ||
      candidate.title.trim().length === 0 ||
      candidate.content.trim().length === 0
    ) {
      continue
    }
    const url = canonicalizeUrl(candidate.url)
    if (!url) continue
    normalized.push(
      Object.freeze({
        ...candidate,
        title: candidate.title.trim(),
        url,
        content: candidate.content.trim(),
        retrievalProvenance: Object.freeze({
          routeDigest,
          pathId: path.id,
          pathPurpose: path.purpose,
          sourceClass: path.sourceClass,
          retrievedAt
        })
      })
    )
  }
  return Object.freeze(normalized)
}

function resultFingerprint(item: SearchResultItem): string {
  return createHash('sha256')
    .update(`${item.url}\u0000${item.title.trim().toLowerCase()}`)
    .digest('hex')
}

function deduplicateResults(
  paths: readonly PathExecution[]
): readonly SearchResultItem[] {
  const seen = new Set<string>()
  const output: SearchResultItem[] = []
  for (const path of paths) {
    for (const result of path.results) {
      const fingerprint = resultFingerprint(result)
      if (seen.has(fingerprint)) continue
      seen.add(fingerprint)
      output.push(result)
      if (output.length >= MAX_TOTAL_RESULTS) return Object.freeze(output)
    }
  }
  return Object.freeze(output)
}

function isMandatoryPath(
  path: ProductionFusionPath,
  routeContext: RouteExecutionContext
): boolean {
  return (
    routeContext.routePlan.requiredSourceClasses.includes(path.sourceClass) ||
    (routeContext.routePlan.needsFreshness && path.purpose === 'freshness_check') ||
    (routeContext.routePlan.needsEntityGrounding &&
      path.purpose === 'entity_disambiguation')
  )
}

function failedPath(
  path: ProductionFusionPath,
  attempts: number,
  errorClass: string
): PathExecution {
  return Object.freeze({
    path,
    outcome: Object.freeze({
      pathId: path.id,
      sourceClass: path.sourceClass,
      purpose: path.purpose,
      status: 'failed',
      attempts,
      resultCount: 0,
      errorClass
    }),
    results: Object.freeze([])
  })
}

async function executePath(
  path: ProductionFusionPath,
  routeContext: RouteExecutionContext,
  searchPort: ProductionSearchPort,
  budget: ToolBudget,
  perPathTimeoutMs: number,
  sleep: (delayMs: number, signal?: AbortSignal) => Promise<void>,
  random: () => number,
  now: () => Date,
  signal?: AbortSignal
): Promise<PathExecution> {
  let attempts = 0
  let lastError: unknown = null

  while (attempts < MAX_RETRIEVAL_ATTEMPTS) {
    throwIfAborted(signal)
    if (!consumeToolBudget(budget)) {
      return failedPath(path, attempts, 'ToolBudgetExceeded')
    }
    attempts += 1
    const scoped = combineAbortSignals(signal, perPathTimeoutMs)
    try {
      const retrievedAt = now().toISOString()
      const response = await searchPort.search({
        query: path.query,
        maxResults: path.maxResults,
        searchDepth: 'advanced',
        includeDomains: Object.freeze([]),
        excludeDomains: Object.freeze([]),
        sourceClass: path.sourceClass,
        pathPurpose: path.purpose,
        signal: scoped.signal
      })
      throwIfAborted(scoped.signal)
      const results = normalizePathResults(
        response,
        path,
        routeContext.routeDigest,
        retrievedAt
      )
      return Object.freeze({
        path,
        outcome: Object.freeze({
          pathId: path.id,
          sourceClass: path.sourceClass,
          purpose: path.purpose,
          status: results.length > 0 ? 'succeeded' : 'empty',
          attempts,
          resultCount: results.length,
          errorClass: null
        }),
        results
      })
    } catch (error) {
      lastError = error
      if (signal?.aborted) {
        return Object.freeze({
          path,
          outcome: Object.freeze({
            pathId: path.id,
            sourceClass: path.sourceClass,
            purpose: path.purpose,
            status: 'cancelled',
            attempts,
            resultCount: 0,
            errorClass: normalizeErrorClass(error)
          }),
          results: Object.freeze([])
        })
      }
      if (!isTransientFailure(error) || attempts >= MAX_RETRIEVAL_ATTEMPTS) break
      if (budget.used >= budget.allowed) {
        return failedPath(path, attempts, 'ToolBudgetExceeded')
      }
      await sleep(retryDelayMs(attempts, error, random), signal)
    } finally {
      scoped.cleanup()
    }
  }

  return failedPath(path, attempts, normalizeErrorClass(lastError))
}

export function createProductionFusionRetrievalExecutor(
  options: ProductionFusionRetrievalExecutorOptions
): ProductionRetrievalExecutor {
  if (!options || typeof options !== 'object') {
    throw new Error('Invalid production Fusion retrieval configuration.')
  }
  if (typeof options.planner?.plan !== 'function') {
    throw new Error('Invalid production Fusion Planner.')
  }
  if (typeof options.searchPort?.search !== 'function') {
    throw new Error('Invalid production Fusion search port.')
  }

  const maxConcurrency = readBoundedInteger(
    options.maxConcurrency,
    DEFAULT_CONCURRENCY,
    1,
    MAX_CONCURRENCY,
    'Invalid Fusion retrieval concurrency.'
  )
  const perPathTimeoutMs = readBoundedInteger(
    options.perPathTimeoutMs,
    DEFAULT_PATH_TIMEOUT_MS,
    MIN_PATH_TIMEOUT_MS,
    MAX_PATH_TIMEOUT_MS,
    'Invalid Fusion retrieval path timeout.'
  )
  const sleep = readSleep(options.sleep)
  const random = readRandom(options.random)
  const now = readNow(options.now)

  return Object.freeze({
    async execute(input) {
      if (!input || typeof input !== 'object') {
        throw new Error('Invalid Fusion retrieval input.')
      }
      const query = typeof input.query === 'string' ? input.query.trim() : ''
      if (!query || query.length > MAX_QUERY_LENGTH) {
        throw new Error('Invalid Fusion retrieval query.')
      }
      if (
        !Number.isSafeInteger(input.attempt) ||
        input.attempt < 1 ||
        input.attempt > MAX_ATTEMPTS
      ) {
        throw new Error('Invalid Fusion retrieval attempt.')
      }

      const routeContext = createRouteExecutionContext(input.routeContext)
      if (!routeContext.routePlan.needsFusionPlanning) {
        throw new Error('Router did not authorize Fusion retrieval.')
      }
      throwIfAborted(input.signal)

      const plan = await options.planner.plan({
        query,
        routeContext,
        ...(input.signal ? { signal: input.signal } : {})
      })
      if (plan.routeDigest !== routeContext.routeDigest) {
        throw new Error('Fusion plan route binding mismatch.')
      }
      if (plan.paths.length > routeContext.routePlan.maxToolCalls) {
        throw new Error('Fusion plan exceeds route tool-call budget.')
      }

      const budget: ToolBudget = {
        used: 0,
        allowed: routeContext.routePlan.maxToolCalls
      }
      const executions: Array<PathExecution | null> = Array.from(
        { length: plan.paths.length },
        () => null
      )
      let cursor = 0

      async function worker(): Promise<void> {
        while (true) {
          throwIfAborted(input.signal)
          const index = cursor
          if (index >= plan.paths.length) return
          cursor += 1
          executions[index] = await executePath(
            plan.paths[index]!,
            routeContext,
            options.searchPort,
            budget,
            perPathTimeoutMs,
            sleep,
            random,
            now,
            input.signal
          )
        }
      }

      await Promise.all(
        Array.from(
          { length: Math.min(maxConcurrency, plan.paths.length) },
          () => worker()
        )
      )
      throwIfAborted(input.signal)

      const completed = executions.filter(
        (value): value is PathExecution => value !== null
      )
      const mandatoryFailure = completed.find(
        value =>
          isMandatoryPath(value.path, routeContext) &&
          value.outcome.status !== 'succeeded'
      )
      if (mandatoryFailure) {
        throw new Error(
          `Mandatory Fusion retrieval path failed: ${mandatoryFailure.outcome.pathId}.`
        )
      }
      if (!completed.some(value => value.outcome.status === 'succeeded')) {
        throw new Error('All Fusion retrieval paths failed or returned no evidence.')
      }

      const searchResults = deduplicateResults(completed)
      const resultsAllowed = Math.min(
        MAX_TOTAL_RESULTS,
        plan.paths.reduce((total, path) => total + path.maxResults, 0)
      )
      const fusion: FusionRetrievalExecutionReport = Object.freeze({
        routeDigest: routeContext.routeDigest,
        reasonCodes: Object.freeze([...plan.reasonCodes]),
        outcomes: Object.freeze(completed.map(value => value.outcome)),
        budget: Object.freeze({
          toolCallsUsed: budget.used,
          toolCallsAllowed: budget.allowed,
          resultsReturned: searchResults.length,
          resultsAllowed
        })
      })

      return Object.freeze({
        searchResults,
        completedRoles: COMPLETED_ROLES,
        retrievedAt: now(),
        fusion
      })
    }
  })
}
