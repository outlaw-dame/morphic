import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CoordinatorRepairStateTransientReadError,
  deleteCoordinatorRepairStateFromPersistence,
  readCoordinatorRepairStateFromPersistence,
  writeCoordinatorRepairStateToPersistence,
  type CoordinatorRepairStatePersistenceAdapter
} from './repair-state-persistence'

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

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Coordinator repair-state persistence operation policy', () => {
  it('retries only explicitly transient reads with bounded exponential delays', async () => {
    vi.useFakeTimers()
    const attempts: number[] = []
    const resultPromise = readCoordinatorRepairStateFromPersistence(
      adapter({
        read: async (_scope, context) => {
          attempts.push(context.attempt)
          if (context.attempt < 3) {
            throw new CoordinatorRepairStateTransientReadError()
          }
          return { status: 'not_found' }
        }
      }),
      scope,
      {
        maxReadAttempts: 3,
        retryBaseDelayMs: 10,
        retryMaxDelayMs: 20,
        timeoutMs: 1000
      }
    )

    await flushMicrotasks()
    expect(attempts).toEqual([1])

    await vi.advanceTimersByTimeAsync(10)
    expect(attempts).toEqual([1, 2])

    await vi.advanceTimersByTimeAsync(20)
    await expect(resultPromise).resolves.toEqual({ status: 'not_found' })
    expect(attempts).toEqual([1, 2, 3])
  })

  it('does not retry ordinary read failures', async () => {
    let attempts = 0
    await expect(
      readCoordinatorRepairStateFromPersistence(
        adapter({
          read: async () => {
            attempts += 1
            throw new Error('backend detail that must not escape')
          }
        }),
        scope,
        { maxReadAttempts: 3, retryBaseDelayMs: 1 }
      )
    ).resolves.toEqual({
      status: 'unavailable',
      reason: 'persistence_unavailable'
    })
    expect(attempts).toBe(1)
  })

  it('times out a non-cooperative read and aborts its operation signal', async () => {
    vi.useFakeTimers()
    let operationSignal: AbortSignal | undefined
    const resultPromise = readCoordinatorRepairStateFromPersistence(
      adapter({
        read: async (_scope, context) => {
          operationSignal = context.signal
          return await new Promise(() => undefined)
        }
      }),
      scope,
      { timeoutMs: 25, maxReadAttempts: 3 }
    )

    await flushMicrotasks()
    expect(operationSignal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(25)

    await expect(resultPromise).resolves.toEqual({
      status: 'unavailable',
      reason: 'persistence_unavailable'
    })
    expect(operationSignal?.aborted).toBe(true)
  })

  it('honors caller cancellation during retry backoff', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    let attempts = 0
    const resultPromise = readCoordinatorRepairStateFromPersistence(
      adapter({
        read: async () => {
          attempts += 1
          throw new CoordinatorRepairStateTransientReadError()
        }
      }),
      scope,
      {
        signal: controller.signal,
        maxReadAttempts: 3,
        retryBaseDelayMs: 100,
        timeoutMs: 1000
      }
    )

    await flushMicrotasks()
    expect(attempts).toBe(1)
    controller.abort()
    await flushMicrotasks()

    await expect(resultPromise).resolves.toEqual({
      status: 'unavailable',
      reason: 'persistence_unavailable'
    })
    expect(attempts).toBe(1)
  })

  it('never retries compare-and-swap after an ambiguous failure', async () => {
    let writes = 0
    const result = await writeCoordinatorRepairStateToPersistence(
      adapter({
        compareAndSwap: async () => {
          writes += 1
          throw new CoordinatorRepairStateTransientReadError()
        }
      }),
      scope,
      { expectedRevision: 0, completedStepIds: ['step_one'] },
      { maxReadAttempts: 3 }
    )

    expect(result).toEqual({
      status: 'unavailable',
      reason: 'persistence_unavailable'
    })
    expect(writes).toBe(1)
  })

  it('never retries deletes and rejects malformed revisions before adapter access', async () => {
    let deletes = 0
    const stored = adapter({
      delete: async () => {
        deletes += 1
        throw new CoordinatorRepairStateTransientReadError()
      }
    })

    await expect(
      deleteCoordinatorRepairStateFromPersistence(stored, scope, 1, {
        maxReadAttempts: 3
      })
    ).resolves.toEqual({
      status: 'unavailable',
      reason: 'persistence_unavailable'
    })
    expect(deletes).toBe(1)

    await expect(
      deleteCoordinatorRepairStateFromPersistence(stored, scope, 1.5)
    ).resolves.toEqual({ status: 'conflict', reason: 'revision_conflict' })
    expect(deletes).toBe(1)
  })
})
