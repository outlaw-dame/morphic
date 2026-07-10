import { describe, expect, it } from 'vitest'

import {
  deleteCoordinatorRepairStateFromPersistence,
  type CoordinatorRepairStatePersistenceAdapter
} from './repair-state-persistence'

const scope = {
  ownerScopeId: 'owner_scope_0123456789abcdef',
  executionScopeId: 'execution_scope_0123456789abcdef'
}

describe('Coordinator persistence cancellation dispatch boundary', () => {
  it('does not invoke a mutation adapter when queued cancellation wins first', async () => {
    const controller = new AbortController()
    let deleteCalls = 0
    const adapter: CoordinatorRepairStatePersistenceAdapter = {
      read: async () => ({ status: 'not_found' }),
      compareAndSwap: async () => ({ status: 'applied' }),
      delete: async () => {
        deleteCalls += 1
        return { status: 'deleted' }
      }
    }

    const queuedAbort = Promise.resolve().then(() => controller.abort())
    const resultPromise = deleteCoordinatorRepairStateFromPersistence(
      adapter,
      scope,
      0,
      { signal: controller.signal }
    )

    await queuedAbort
    await expect(resultPromise).resolves.toEqual({
      status: 'unavailable',
      reason: 'persistence_unavailable'
    })
    expect(deleteCalls).toBe(0)
  })
})
