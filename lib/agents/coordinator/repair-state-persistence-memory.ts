import type {
  CoordinatorRepairStatePersistenceAdapter,
  CoordinatorRepairStatePersistenceOperationContext
} from './repair-state-persistence'
import {
  createCoordinatorRepairStateEnvelope,
  readCoordinatorRepairStateEnvelope,
  type CoordinatorRepairStateEnvelope,
  type CoordinatorRepairStateScope
} from './repair-state-scope'

const DEFAULT_MAX_ENTRIES = 1_000
const MAX_ENTRIES_CAP = 10_000
const KEY_SEPARATOR = '\u0000'

export type CoordinatorRepairStateInMemoryAdapterOptions = {
  maxEntries?: number
}

export class CoordinatorRepairStateInMemoryUnavailableError extends Error {
  constructor() {
    super('In-memory repair-state persistence is unavailable')
    this.name = 'CoordinatorRepairStateInMemoryUnavailableError'
  }
}

function boundedMaxEntries(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_MAX_ENTRIES
  }

  return Math.min(MAX_ENTRIES_CAP, Math.max(1, Math.floor(value)))
}

function assertActive(
  context: CoordinatorRepairStatePersistenceOperationContext | undefined
): void {
  if (!context?.signal || context.signal.aborted) {
    throw new CoordinatorRepairStateInMemoryUnavailableError()
  }
}

function validRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function validatedScope(value: unknown): CoordinatorRepairStateScope | null {
  const created = createCoordinatorRepairStateEnvelope(value)
  if (created.status !== 'created') return null

  return {
    ownerScopeId: created.envelope.ownerScopeId,
    executionScopeId: created.envelope.executionScopeId
  }
}

function scopeKey(scope: CoordinatorRepairStateScope): string {
  return `${scope.ownerScopeId}${KEY_SEPARATOR}${scope.executionScopeId}`
}

function cloneAuthorizedEnvelope(
  value: unknown,
  scope: CoordinatorRepairStateScope
): CoordinatorRepairStateEnvelope | null {
  const read = readCoordinatorRepairStateEnvelope(value, scope)
  if (read.status !== 'authorized') return null

  const created = createCoordinatorRepairStateEnvelope(scope, read.snapshot)
  return created.status === 'created' ? created.envelope : null
}

export function createCoordinatorRepairStateInMemoryAdapter(
  options: CoordinatorRepairStateInMemoryAdapterOptions = {}
): CoordinatorRepairStatePersistenceAdapter {
  const maxEntries = boundedMaxEntries(options.maxEntries)
  const records = new Map<string, CoordinatorRepairStateEnvelope>()

  return {
    async read(scopeValue, context) {
      assertActive(context)
      const scope = validatedScope(scopeValue)
      if (!scope) throw new CoordinatorRepairStateInMemoryUnavailableError()

      const stored = records.get(scopeKey(scope))
      if (!stored) return { status: 'not_found' }

      const envelope = cloneAuthorizedEnvelope(stored, scope)
      if (!envelope) throw new CoordinatorRepairStateInMemoryUnavailableError()

      return { status: 'found', envelope }
    },

    async compareAndSwap({ scope: scopeValue, expectedRevision, envelope, context }) {
      assertActive(context)
      const scope = validatedScope(scopeValue)
      if (!scope) return { status: 'conflict' }
      if (expectedRevision !== null && !validRevision(expectedRevision)) {
        return { status: 'conflict' }
      }

      const nextEnvelope = cloneAuthorizedEnvelope(envelope, scope)
      if (!nextEnvelope) return { status: 'conflict' }

      const key = scopeKey(scope)
      const current = records.get(key)

      if (expectedRevision === null) {
        if (current || nextEnvelope.snapshot.revision !== 0) {
          return { status: 'conflict' }
        }
        if (records.size >= maxEntries) {
          throw new CoordinatorRepairStateInMemoryUnavailableError()
        }

        records.set(key, nextEnvelope)
        return { status: 'applied' }
      }

      if (
        !current ||
        current.snapshot.revision !== expectedRevision ||
        nextEnvelope.snapshot.revision !== expectedRevision + 1
      ) {
        return { status: 'conflict' }
      }

      records.set(key, nextEnvelope)
      return { status: 'applied' }
    },

    async delete({ scope: scopeValue, expectedRevision, context }) {
      assertActive(context)
      const scope = validatedScope(scopeValue)
      if (!scope || !validRevision(expectedRevision)) {
        return { status: 'conflict' }
      }

      const key = scopeKey(scope)
      const current = records.get(key)
      if (!current) return { status: 'not_found' }
      if (current.snapshot.revision !== expectedRevision) {
        return { status: 'conflict' }
      }

      records.delete(key)
      return { status: 'deleted' }
    }
  }
}
