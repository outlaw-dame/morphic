import { describe, expect, it } from 'vitest'

import {
  deleteCoordinatorRepairStateFromPersistence,
  readCoordinatorRepairStateFromPersistence,
  writeCoordinatorRepairStateToPersistence,
  type CoordinatorRepairStatePersistenceAdapter
} from './repair-state-persistence'
import { createCoordinatorRepairStateEnvelope } from './repair-state-scope'

const scope = {
  ownerScopeId: 'owner_scope_0123456789abcdef',
  executionScopeId: 'execution_scope_0123456789abcdef'
}

function adapter(
  overrides: Partial<CoordinatorRepairStatePersistenceAdapter> = {}
): CoordinatorRepairStatePersistenceAdapter {
  return {
    read: async () => ({ status: 'not_found' }),
    compareAndSwap: async () => ({ status: 'applied' }),
    delete: async () => ({ status: 'deleted' }),
    ...overrides
  }
}

describe('Coordinator repair state persistence contract', () => {
  it('fails closed before calling an adapter for malformed scope input', async () => {
    let reads = 0
    const result = await readCoordinatorRepairStateFromPersistence(
      adapter({
        read: async () => {
          reads += 1
          return { status: 'not_found' }
        }
      }),
      { ownerScopeId: 'short', executionScopeId: scope.executionScopeId }
    )

    expect(result).toEqual({ status: 'denied', reason: 'scope_denied' })
    expect(reads).toBe(0)
  })

  it('sanitizes and authorizes stored envelopes without exposing raw adapter data', async () => {
    const created = createCoordinatorRepairStateEnvelope(scope, {
      revision: 2,
      completedStepIds: [' step_one '],
      evidenceText: 'must-not-escape'
    })
    if (created.status !== 'created') throw new Error('expected envelope')

    const result = await readCoordinatorRepairStateFromPersistence(
      adapter({ read: async () => ({ status: 'found', envelope: created.envelope }) }),
      scope
    )

    expect(result.status).toBe('found')
    if (result.status !== 'found') throw new Error('expected found')
    expect(result.envelope.snapshot.completedStepIds).toEqual(['step_one'])
    expect(result.envelope).not.toHaveProperty('evidenceText')
  })

  it('rejects a cross-scope stored envelope with one indistinguishable denial', async () => {
    const created = createCoordinatorRepairStateEnvelope({
      ownerScopeId: 'other_owner_scope_0123456789abcdef',
      executionScopeId: scope.executionScopeId
    })
    if (created.status !== 'created') throw new Error('expected envelope')

    await expect(
      readCoordinatorRepairStateFromPersistence(
        adapter({ read: async () => ({ status: 'found', envelope: created.envelope }) }),
        scope
      )
    ).resolves.toEqual({ status: 'denied', reason: 'scope_denied' })
  })

  it('uses atomic create compare-and-swap and reports races as conflicts', async () => {
    let expectedRevision: number | null | undefined
    const result = await writeCoordinatorRepairStateToPersistence(
      adapter({
        compareAndSwap: async input => {
          expectedRevision = input.expectedRevision
          return { status: 'conflict' }
        }
      }),
      scope,
      { expectedRevision: 0, completedStepIds: ['step_one'] }
    )

    expect(expectedRevision).toBeNull()
    expect(result).toEqual({ status: 'conflict', reason: 'revision_conflict' })
  })

  it('does not create a missing record for a no-op update', async () => {
    let writes = 0
    const result = await writeCoordinatorRepairStateToPersistence(
      adapter({
        compareAndSwap: async () => {
          writes += 1
          return { status: 'applied' }
        }
      }),
      scope,
      { expectedRevision: 0 }
    )

    expect(result.status).toBe('noop')
    expect(writes).toBe(0)
  })

  it('uses the stored revision for compare-and-swap updates', async () => {
    const created = createCoordinatorRepairStateEnvelope(scope, { revision: 4 })
    if (created.status !== 'created') throw new Error('expected envelope')
    let expectedRevision: number | null | undefined

    const result = await writeCoordinatorRepairStateToPersistence(
      adapter({
        read: async () => ({ status: 'found', envelope: created.envelope }),
        compareAndSwap: async input => {
          expectedRevision = input.expectedRevision
          return { status: 'applied' }
        }
      }),
      scope,
      { expectedRevision: 4, completedStepIds: ['step_one'] }
    )

    expect(expectedRevision).toBe(4)
    expect(result.status).toBe('applied')
  })

  it('does not write idempotent updates', async () => {
    const created = createCoordinatorRepairStateEnvelope(scope, {
      revision: 1,
      completedStepIds: ['step_one'],
      priorAttemptsByStepId: { step_one: 1 }
    })
    if (created.status !== 'created') throw new Error('expected envelope')
    let writes = 0

    const result = await writeCoordinatorRepairStateToPersistence(
      adapter({
        read: async () => ({ status: 'found', envelope: created.envelope }),
        compareAndSwap: async () => {
          writes += 1
          return { status: 'applied' }
        }
      }),
      scope,
      { expectedRevision: 1, completedStepIds: ['step_one'] }
    )

    expect(result.status).toBe('noop')
    expect(writes).toBe(0)
  })

  it('requires revision-matched deletion and collapses adapter errors', async () => {
    const created = createCoordinatorRepairStateEnvelope(scope, { revision: 3 })
    if (created.status !== 'created') throw new Error('expected envelope')
    const stored = adapter({
      read: async () => ({ status: 'found', envelope: created.envelope }),
      delete: async () => {
        throw new Error('secret backend details')
      }
    })

    await expect(
      deleteCoordinatorRepairStateFromPersistence(stored, scope, 2)
    ).resolves.toEqual({ status: 'conflict', reason: 'revision_conflict' })

    await expect(
      deleteCoordinatorRepairStateFromPersistence(stored, scope, 3)
    ).resolves.toEqual({
      status: 'unavailable',
      reason: 'persistence_unavailable'
    })
  })
})
