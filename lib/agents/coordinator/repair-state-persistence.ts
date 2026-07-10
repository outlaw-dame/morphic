import {
  applyCoordinatorRepairStateEnvelopeUpdate,
  createCoordinatorRepairStateEnvelope,
  readCoordinatorRepairStateEnvelope,
  type CoordinatorRepairStateEnvelope,
  type CoordinatorRepairStateScope
} from './repair-state-scope'

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
  read(scope: CoordinatorRepairStateScope): Promise<CoordinatorRepairStatePersistenceReadResult>
  compareAndSwap(input: {
    scope: CoordinatorRepairStateScope
    expectedRevision: number | null
    envelope: CoordinatorRepairStateEnvelope
  }): Promise<CoordinatorRepairStatePersistenceWriteResult>
  delete(input: {
    scope: CoordinatorRepairStateScope
    expectedRevision: number
  }): Promise<CoordinatorRepairStatePersistenceDeleteResult>
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

function unavailable(): { status: 'unavailable'; reason: 'persistence_unavailable' } {
  return { status: 'unavailable', reason: 'persistence_unavailable' }
}

export async function readCoordinatorRepairStateFromPersistence(
  adapter: CoordinatorRepairStatePersistenceAdapter,
  authenticatedScope: CoordinatorRepairStateScope
): Promise<CoordinatorRepairStateStoreReadResult> {
  try {
    const stored = await adapter.read(authenticatedScope)
    if (stored.status === 'not_found') return stored

    const authorized = readCoordinatorRepairStateEnvelope(stored.envelope, authenticatedScope)
    if (authorized.status !== 'authorized') return authorized

    const created = createCoordinatorRepairStateEnvelope(
      authenticatedScope,
      authorized.snapshot
    )
    return created.status === 'created'
      ? { status: 'found', envelope: created.envelope }
      : created
  } catch {
    return unavailable()
  }
}

export async function writeCoordinatorRepairStateToPersistence(
  adapter: CoordinatorRepairStatePersistenceAdapter,
  authenticatedScope: CoordinatorRepairStateScope,
  updateValue: unknown
): Promise<CoordinatorRepairStateStoreWriteResult> {
  const current = await readCoordinatorRepairStateFromPersistence(
    adapter,
    authenticatedScope
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
      return {
        status: 'conflict',
        reason: updated.update.reason
      }
    }

    try {
      const persisted = await adapter.compareAndSwap({
        scope: authenticatedScope,
        expectedRevision: null,
        envelope: updated.envelope
      })
      return persisted.status === 'applied'
        ? { status: updated.update.status, envelope: updated.envelope }
        : { status: 'conflict', reason: 'revision_conflict' }
    } catch {
      return unavailable()
    }
  }

  const updated = applyCoordinatorRepairStateEnvelopeUpdate(
    current.envelope,
    authenticatedScope,
    updateValue
  )
  if (updated.status !== 'authorized') return updated
  if (updated.update.status === 'conflict') {
    return {
      status: 'conflict',
      reason: updated.update.reason
    }
  }
  if (updated.update.status === 'noop') {
    return { status: 'noop', envelope: updated.envelope }
  }

  try {
    const persisted = await adapter.compareAndSwap({
      scope: authenticatedScope,
      expectedRevision: current.envelope.snapshot.revision,
      envelope: updated.envelope
    })
    return persisted.status === 'applied'
      ? { status: 'applied', envelope: updated.envelope }
      : { status: 'conflict', reason: 'revision_conflict' }
  } catch {
    return unavailable()
  }
}

export async function deleteCoordinatorRepairStateFromPersistence(
  adapter: CoordinatorRepairStatePersistenceAdapter,
  authenticatedScope: CoordinatorRepairStateScope,
  expectedRevision: number
): Promise<CoordinatorRepairStateStoreDeleteResult> {
  const current = await readCoordinatorRepairStateFromPersistence(
    adapter,
    authenticatedScope
  )
  if (current.status === 'unavailable' || current.status === 'denied') {
    return current
  }
  if (current.status === 'not_found') return current
  if (current.envelope.snapshot.revision !== expectedRevision) {
    return { status: 'conflict', reason: 'revision_conflict' }
  }

  try {
    const deleted = await adapter.delete({
      scope: authenticatedScope,
      expectedRevision
    })
    if (deleted.status === 'deleted' || deleted.status === 'not_found') {
      return deleted
    }
    return { status: 'conflict', reason: 'revision_conflict' }
  } catch {
    return unavailable()
  }
}
