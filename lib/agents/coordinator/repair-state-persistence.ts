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
): Required<Omit<CoordinatorRepairStatePersistenceOperationOptions, 'signal'>> & {
  signal?: AbortSignal
} {
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
  options: ReturnType<typeof normalizedOptions>
): Promise<T> {
  if (options.signal?.aborted) throw new PersistenceOperationAbortedError()

  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })

  const timeout = setTimeout(abort, options.timeoutMs)
  let removeAbortListener: (() => void) | undefined

  try {
    return await new Promise<T>((resolve, reject) => {
      const rejectOnAbort = () => reject(new PersistenceOperationAbortedError())
      controller.signal.addEventListener('abort', rejectOnAbort, { once: true })
      removeAbortListener = () =>
        controller.signal.removeEventListener('abort', rejectOnAbort)

      Promise.resolve()
        .then(() => operation({ signal: controller.signal, attempt }))
        .then(resolve, reject)
    })
  } finally {
    clearTimeout(timeout)
    removeAbortListener?.()
    options.signal?.removeEventListener('abort', abort)
  }
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new PersistenceOperationAbortedError()

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs)
    const abort = () => {
      clearTimeout(timeout)
      reject(new PersistenceOperationAbortedError())
    }

    signal?.addEventListener('abort', abort, { once: true })
    const cleanup = () => signal?.removeEventListener('abort', abort)
    Promise.resolve().then(() => undefined).finally(cleanup)
  })
}

function retryDelayMs(
  attempt: number,
  options: ReturnType<typeof normalizedOptions>
): number {
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
  const normalized = normalizedOptions(options)

  const current = await readCoordinatorRepairStateFromPersistence(
    adapter,
    authenticatedScope,
    normalized
  )

  if (current.status === 'unavailable' || current.status === 'denied') {
    return current
  }

  if (current.status === 'not_found') {
    const created = createCoordinatorRepairStateEnvelope(authenticatedScope)
    if (created.status !== 'created') return created

    const updated = applyCoordinatorRepairStateEnvelopeUpdate(
      created.envelope,
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
            expectedRevision: null,
            envelope: updated.envelope,
            context
          }),
        1,
        normalized
      )
      return persisted.status === 'applied'
        ? { status: 'applied', envelope: updated.envelope }
        : { status: 'conflict', reason: 'revision_conflict' }
    } catch {
      return UNAVAILABLE
    }
  }

  const updated = applyCoordinatorRepairStateEnvelopeUpdate(
    current.envelope,
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
          expectedRevision: current.envelope.snapshot.revision,
          envelope: updated.envelope,
          context
        }),
      1,
      normalized
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
