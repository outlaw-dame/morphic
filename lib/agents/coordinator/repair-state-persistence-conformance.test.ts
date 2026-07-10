import { describe, expect, it } from 'vitest'

import {
  runCoordinatorRepairStatePersistenceConformance,
  type CoordinatorRepairStatePersistenceConformanceFactory
} from './repair-state-persistence-conformance'
import type {
  CoordinatorRepairStatePersistenceAdapter,
  CoordinatorRepairStatePersistenceOperationContext
} from './repair-state-persistence'
import type {
  CoordinatorRepairStateEnvelope,
  CoordinatorRepairStateScope
} from './repair-state-scope'

function key(scope: CoordinatorRepairStateScope): string {
  return `${scope.ownerScopeId}\u0000${scope.executionScopeId}`
}

function assertActive(context: CoordinatorRepairStatePersistenceOperationContext): void {
  if (context.signal.aborted) throw new Error('aborted')
}

function compliantFactory(): CoordinatorRepairStatePersistenceConformanceFactory {
  return () => {
    const records = new Map<string, CoordinatorRepairStateEnvelope>()

    const adapter: CoordinatorRepairStatePersistenceAdapter = {
      async read(scope, context) {
        assertActive(context)
        const envelope = records.get(key(scope))
        return envelope ? { status: 'found', envelope } : { status: 'not_found' }
      },
      async compareAndSwap({ scope, expectedRevision, envelope, context }) {
        assertActive(context)
        const recordKey = key(scope)
        const current = records.get(recordKey)

        if (expectedRevision === null) {
          if (current) return { status: 'conflict' }
          records.set(recordKey, envelope)
          return { status: 'applied' }
        }

        if (!current || current.snapshot.revision !== expectedRevision) {
          return { status: 'conflict' }
        }

        records.set(recordKey, envelope)
        return { status: 'applied' }
      },
      async delete({ scope, expectedRevision, context }) {
        assertActive(context)
        const recordKey = key(scope)
        const current = records.get(recordKey)
        if (!current) return { status: 'not_found' }
        if (current.snapshot.revision !== expectedRevision) {
          return { status: 'conflict' }
        }
        records.delete(recordKey)
        return { status: 'deleted' }
      }
    }

    return adapter
  }
}

describe('Coordinator repair-state persistence conformance runner', () => {
  it('passes a compliant isolated compare-and-swap adapter', async () => {
    const report = await runCoordinatorRepairStatePersistenceConformance(
      compliantFactory()
    )

    expect(report.passed).toBe(true)
    expect(report.results).toHaveLength(6)
    expect(report.results.every(result => result.passed)).toBe(true)
  })

  it('detects stale-write acceptance without leaking adapter data', async () => {
    const baseFactory = compliantFactory()
    const report = await runCoordinatorRepairStatePersistenceConformance(async () => {
      const adapter = await baseFactory()
      return {
        ...adapter,
        async compareAndSwap(input) {
          if (input.expectedRevision !== null) return { status: 'applied' }
          return adapter.compareAndSwap(input)
        }
      }
    })

    expect(report.passed).toBe(false)
    expect(report.results).toContainEqual({
      case: 'stale_update_rejected',
      passed: false,
      reason: 'unexpected_result'
    })
    expect(JSON.stringify(report)).not.toContain('conformance_owner')
  })

  it('detects cross-owner storage aliasing', async () => {
    const report = await runCoordinatorRepairStatePersistenceConformance(() => {
      const records = new Map<string, CoordinatorRepairStateEnvelope>()
      return {
        async read(scope, context) {
          assertActive(context)
          const envelope = records.get(scope.executionScopeId)
          return envelope ? { status: 'found', envelope } : { status: 'not_found' }
        },
        async compareAndSwap({ scope, expectedRevision, envelope, context }) {
          assertActive(context)
          const current = records.get(scope.executionScopeId)
          if (expectedRevision === null && current) return { status: 'conflict' }
          if (
            expectedRevision !== null &&
            (!current || current.snapshot.revision !== expectedRevision)
          ) {
            return { status: 'conflict' }
          }
          records.set(scope.executionScopeId, envelope)
          return { status: 'applied' }
        },
        async delete({ scope, expectedRevision, context }) {
          assertActive(context)
          const current = records.get(scope.executionScopeId)
          if (!current) return { status: 'not_found' }
          if (current.snapshot.revision !== expectedRevision) {
            return { status: 'conflict' }
          }
          records.delete(scope.executionScopeId)
          return { status: 'deleted' }
        }
      }
    })

    expect(report.results).toContainEqual({
      case: 'owner_scope_isolation',
      passed: false,
      reason: 'unexpected_result'
    })
  })

  it('bounds a non-cooperative adapter case', async () => {
    const report = await runCoordinatorRepairStatePersistenceConformance(
      () => ({
        read: async () => new Promise(() => undefined),
        compareAndSwap: async () => new Promise(() => undefined),
        delete: async () => new Promise(() => undefined)
      }),
      { caseTimeoutMs: 10 }
    )

    expect(report.passed).toBe(false)
    expect(report.results.every(result => result.reason === 'timeout')).toBe(true)
  })
})
