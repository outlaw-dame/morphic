import {
  applyCoordinatorRepairStateEnvelopeUpdate,
  createCoordinatorRepairStateEnvelope,
  readCoordinatorRepairStateEnvelope,
  type CoordinatorRepairStateEnvelope,
  type CoordinatorRepairStateScope
} from './repair-state-scope'

const DEFAULT_OPERATION_TIMEOUT_MS = 5000
const MAX_OPERATION_TIMEOUT_MS = 30_000
const DEFAULT_MAX_READ_ATTEMPTS = 2
const MAX_READ_ATTEMPTS = 3
const DEFAULT_RETRY_BASE_DELAY_MS = 100
const DEFAULT_RETRY_MAX_DELAY_MS = 1000
const MAX_RETRY_DELAY_MS = 5000

export type CoordinatorRepairStatePersistenceOperationContext = {
  signal: AbortSignal
  attempt: number
}

export type CoordinatorRepairStatePersistenceReadResult =
  | { status: 'found'; envelope: unknown }
  | { status: 'not_found' }

export type CoordinatorRepairStatePersistenceWriteResult =
  | { status: 'applied' }
  | { status: 'conflict' }

export type CoordinatorRepairStatePersistenceDeleteResult =
  | { status: 'deleted' }
  | { status: 'not_found' }
  | { status: 'conflict' }

export interface CoordinatorRepairStatePersistenceAdapter {
  read(
    scope: CoordinatorRepairStateScope,
    context: CoordinatorRepairStatePersistenceOperationContext
  ): Promise<CoordinatorRepairStatePersistenceReadResult>
  compareAndSwap(input: {
    scope: CoordinatorRepairStateScope
    expectedRevision: number | null
    envelope: CoordinatorRepairStateEnvelope
    context: CoordinatorRepairStatePersistenceOperationContext
  }): Promise<CoordinatorRepairStatePersistenceWriteResult>
  delete(input: {
    scope: CoordinatorRepairStateScope
    expectedRevision: number
    context: CoordinatorRepairStatePersistenceOperationContext
  }): Promise<CoordinatorRepairStatePersistenceDeleteResult>
}

export type CoordinatorRepairStatePersistenceOperationOptions = {
  signal?: AbortSignal
  timeoutMs?: number
  maxReadAttempts?: number
  retryBaseDelayMs?: number
  retryMaxDelayMs?: number
}

export class CoordinatorRepairStateTransientReadError extends Error {
  constructor() {
    super('Transient repair-state persistence read failure')
    this.name = 'CoordinatorRepairStateTransientReadError'
  }
}

export type CoordinatorRepairStateStoreReadResult =
  | { status: 'found'; envelope: CoordinatorRepairStateEnvelope }
  | { status: 'not_found' }
  | { status: 'denied'; reason: 'scope_denied' }
  | { status: 'unavailable'; reason: 'persistence_unavailable' }

export type CoordinatorRepairStateStoreWriteResult =
  | { status: 'applied'; envelope: CoordinatorRepairStateEnvelope }
  | { status: 'noop'; envelope: CoordinatorRepairStateEnvelope }
  | { status: 'conflict'; reason: 'revision_conflict' | 'revision_exhausted' }
  | { status: 'denied'; reason: 'scope_denied' }
  | { status: 'unavailable'; reason: 'persistence_unavailable' }

export type CoordinatorRepairStateStoreDeleteResult =
  | { status: 'deleted' }
  | { status: 'not_found' }
  | { status: 'conflict'; reason: 'revision_conflict' }
  | { status: 'denied'; reason: 'scope_denied' }
  | { status: 'unavailable'; reason: 'persistence_unavailable' }

const SCOPE_DENIED = { status: 'denied', reason: 'scope_denied' } as const
const UNAVAILABLE = {
  status: 'unavailable',
  reason: 'persistence_unavailable'
} as const

class PersistenceOperationAbortedError extends Error {}

type NormalizedOptions = {
  signal?: AbortSignal
  timeoutMs: number
  maxReadAttempts: number
  retryBaseDelayMs: number
  retryMaxDelayMs: number
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.floor(value)))
}

function normalizedOptions(
  options: CoordinatorRepairStatePersistenceOperationOptions = {}
): NormalizedOptions {
  const retryBaseDelayMs = boundedInteger(
    options.retryBaseDelayMs,
    DEFAULT_RETRY_BASE_DELAY_MS,
    1,
    MAX_RETRY_DELAY_MS
  )

  return {
    signal: options.signal,
    timeoutMs: boundedInteger(
      options.timeoutMs,
      DEFAULT_OPERATION_TIMEOUT_MS,
      1,
      MAX_OPERATION_TIMEOUT_MS
    ),
    maxReadAttempts: boundedInteger(
      options.maxReadAttempts,
      DEFAULT_MAX_READ_ATTEMPTS,
      1,
      MAX_READ_ATTEMPTS
    ),
    retryBaseDelayMs,
    retryMaxDelayMs: Math.max(
      retryBaseDelayMs,
      boundedInteger(
        options.retryMaxDelayMs,
        DEFAULT_RETRY_MAX_DELAY_MS,
        1,
        MAX_RETRY_DELAY_MS
      )
    )
  }
}

function validatedPersistenceScope(
  value: unknown
): CoordinatorRepairStateScope | null {
  const created = createCoordinatorRepairStateEnvelope(value)
  if (created.status !== 'created') return null
  return {
    ownerScopeId: created.envelope.ownerScopeId,
    executionScopeId: created.envelope.executionScopeId
  }
}

function validRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

async function runBoundedOperation<T>(
  operation: (context: CoordinatorRepairStatePersistenceOperationContext) => Promise<T>,
  attempt: number,
  options: NormalizedOptions
): Promise<T> {
  if (options.signal?.aborted) throw new PersistenceOperationAbortedError()

  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, options.timeoutMs)

  const rejectOnAbort = () => {
    throw new PersistenceOperationAbortedError()
  }

  try {
    return await Promise.race([
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          'abort',
          () => reject(new PersistenceOperationAbortedError()),
          { once: true }
        )
      }),
      Promise.resolve().then(() => {
        if (controller.signal.aborted) rejectOnAbort()
        return operation({ signal: controller.signal, attempt })
      })
    ])
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
  }
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new PersistenceOperationAbortedError()

  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      reject(new PersistenceOperationAbortedError())
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, delayMs)

    signal?.addEventListener('abort', abort, { once: true })
  })
}

function retryDelayMs(attempt: number, options: NormalizedOptions): number {
  return Math.min(
    options.retryMaxDelayMs,
    options.retryBaseDelayMs * 2 ** Math.max(0, attempt - 1)
  )
}

async function readWithPolicy(
  adapter: CoordinatorRepairStatePersistenceAdapter,
  scope: CoordinatorRepairStateScope,
  optionsValue?: CoordinatorRepairStatePersistenceOperationOptions
): Promise<CoordinatorRepairStatePersistenceReadResult> {
  const options = normalizedOptions(optionsValue)

  for (let attempt = 1; attempt <= options.maxReadAttempts; attempt += 1) {
    try {
      return await runBoundedOperation(
        context => adapter.read(scope, context),
        attempt,
        options
      )
    } catch (error) {
      const canRetry =
        error instanceof CoordinatorRepairStateTransientReadError &&
        attempt < options.maxReadAttempts &&
        !options.signal?.aborted
      if (!canRetry) throw error
      await waitForRetry(retryDelayMs(attempt, options), options.signal)
    }
  }

  throw new PersistenceOperationAbortedError()
}

export async function readCoordinatorRepairStateFromPersistence(
  adapter: CoordinatorRepairStatePersistenceAdapter,
  authenticatedScopeValue: unknown,
  options?: CoordinatorRepairStatePersistenceOperationOptions
): Promise<CoordinatorRepairStateStoreReadResult> {
  const authenticatedScope = validatedPersistenceScope(authenticatedScopeValue)
  if (!authenticatedScope) return SCOPE_DENIED

  try {
    const stored = await readWithPolicy(adapter, authenticatedScope, options)
    if (stored.status === 'not_found') return stored

    const authorized = readCoordinatorRepairStateEnvelope(
      stored.envelope,
      authenticatedScope
    )
    if (authorized.status !== 'authorized') return authorized

    const created = createCoordinatorRepairStateEnvelope(
      authenticatedScope,
      authorized.snapshot
    )
    return created.status === 'created'
      ? { status: 'found', envelope: created.envelope }
      : created
  } catch {
    return UNAVAILABLE
  }
}

export async function writeCoordinatorRepairStateToPersistence(
  adapter: CoordinatorRepairStatePersistenceAdapter,
  authenticatedScopeValue: unknown,
  updateValue: unknown,
  options?: CoordinatorRepairStatePersistenceOperationOptions
): Promise<CoordinatorRepairStateStoreWriteResult> {
  const authenticatedScope = validatedPersistenceScope(authenticatedScopeValue)
  if (!authenticatedScope) return SCOPE_DENIED
  const policy = normalizedOptions(options)

  const current = await readCoordinatorRepairStateFromPersistence(
    adapter,
    authenticatedScope,
    policy
  )
  if (current.status === 'unavailable' || current.status === 'denied') return current

  const baseEnvelope =
    current.status === 'not_found'
      ? createCoordinatorRepairStateEnvelope(authenticatedScope)
      : { status: 'created' as const, envelope: current.envelope }
  if (baseEnvelope.status !== 'created') return baseEnvelope

  const updated = applyCoordinatorRepairStateEnvelopeUpdate(
    baseEnvelope.envelope,
    authenticatedScope,
    updateValue
  )
  if (updated.status !== 'authorized') return updated
  if (updated.update.status === 'conflict') {
    return { status: 'conflict', reason: updated.update.reason }
  }
  if (updated.update.status === 'noop') {
    return { status: 'noop', envelope: updated.envelope }
  }

  try {
    const persisted = await runBoundedOperation(
      context =>
        adapter.compareAndSwap({
          scope: authenticatedScope,
          expectedRevision:
            current.status === 'not_found'
              ? null
              : current.envelope.snapshot.revision,
          envelope: updated.envelope,
          context
        }),
      1,
      policy
    )
    return persisted.status === 'applied'
      ? { status: 'applied', envelope: updated.envelope }
      : { status: 'conflict', reason: 'revision_conflict' }
  } catch {
    return UNAVAILABLE
  }
}

export async function deleteCoordinatorRepairStateFromPersistence(
  adapter: CoordinatorRepairStatePersistenceAdapter,
  authenticatedScopeValue: unknown,
  expectedRevision: number,
  options?: CoordinatorRepairStatePersistenceOperationOptions
): Promise<CoordinatorRepairStateStoreDeleteResult> {
  const authenticatedScope = validatedPersistenceScope(authenticatedScopeValue)
  if (!authenticatedScope) return SCOPE_DENIED
  if (!validRevision(expectedRevision)) {
    return { status: 'conflict', reason: 'revision_conflict' }
  }

  try {
    const deleted = await runBoundedOperation(
      context =>
        adapter.delete({
          scope: authenticatedScope,
          expectedRevision,
          context
        }),
      1,
      normalizedOptions(options)
    )
    if (deleted.status === 'deleted' || deleted.status === 'not_found') {
      return deleted
    }
    return { status: 'conflict', reason: 'revision_conflict' }
  } catch {
    return UNAVAILABLE
  }
}
