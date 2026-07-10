import {
  createCoordinatorRepairStateEnvelope,
  type CoordinatorRepairStateEnvelope,
  type CoordinatorRepairStateScope
} from './repair-state-scope'
import type {
  CoordinatorRepairStatePersistenceAdapter,
  CoordinatorRepairStatePersistenceOperationContext
} from './repair-state-persistence'

export type CoordinatorRepairStatePersistenceConformanceCase =
  | 'atomic_create'
  | 'stale_update_rejected'
  | 'atomic_delete'
  | 'owner_scope_isolation'
  | 'execution_scope_isolation'
  | 'abort_signal_propagation'

export type CoordinatorRepairStatePersistenceConformanceResult = {
  case: CoordinatorRepairStatePersistenceConformanceCase
  passed: boolean
  reason?: 'unexpected_result' | 'adapter_error'
}

export type CoordinatorRepairStatePersistenceConformanceReport = {
  passed: boolean
  results: CoordinatorRepairStatePersistenceConformanceResult[]
}

export type CoordinatorRepairStatePersistenceConformanceFactory = () =>
  | CoordinatorRepairStatePersistenceAdapter
  | Promise<CoordinatorRepairStatePersistenceAdapter>

const OWNER_SCOPE = 'conformance_owner_0123456789abcdef'
const OTHER_OWNER_SCOPE = 'conformance_other_owner_0123456789abcdef'
const EXECUTION_SCOPE = 'conformance_execution_0123456789abcdef'
const OTHER_EXECUTION_SCOPE = 'conformance_other_execution_0123456789abcdef'

const scope: CoordinatorRepairStateScope = {
  ownerScopeId: OWNER_SCOPE,
  executionScopeId: EXECUTION_SCOPE
}

function context(
  signal = new AbortController().signal
): CoordinatorRepairStatePersistenceOperationContext {
  return { signal, attempt: 1 }
}

function envelopeFor(
  targetScope: CoordinatorRepairStateScope,
  revision: number
): CoordinatorRepairStateEnvelope {
  const created = createCoordinatorRepairStateEnvelope(targetScope, { revision })
  if (created.status !== 'created') throw new Error('Invalid conformance fixture scope')
  return created.envelope
}

async function runCase(
  testCase: CoordinatorRepairStatePersistenceConformanceCase,
  operation: () => Promise<boolean>
): Promise<CoordinatorRepairStatePersistenceConformanceResult> {
  try {
    const passed = await operation()
    return passed
      ? { case: testCase, passed: true }
      : { case: testCase, passed: false, reason: 'unexpected_result' }
  } catch {
    return { case: testCase, passed: false, reason: 'adapter_error' }
  }
}

export async function runCoordinatorRepairStatePersistenceConformance(
  factory: CoordinatorRepairStatePersistenceConformanceFactory
): Promise<CoordinatorRepairStatePersistenceConformanceReport> {
  const results: CoordinatorRepairStatePersistenceConformanceResult[] = []

  results.push(
    await runCase('atomic_create', async () => {
      const adapter = await factory()
      const envelope = envelopeFor(scope, 0)
      const first = await adapter.compareAndSwap({
        scope,
        expectedRevision: null,
        envelope,
        context: context()
      })
      const second = await adapter.compareAndSwap({
        scope,
        expectedRevision: null,
        envelope,
        context: context()
      })
      return first.status === 'applied' && second.status === 'conflict'
    })
  )

  results.push(
    await runCase('stale_update_rejected', async () => {
      const adapter = await factory()
      const initial = envelopeFor(scope, 0)
      const next = envelopeFor(scope, 1)
      await adapter.compareAndSwap({
        scope,
        expectedRevision: null,
        envelope: initial,
        context: context()
      })
      const applied = await adapter.compareAndSwap({
        scope,
        expectedRevision: 0,
        envelope: next,
        context: context()
      })
      const stale = await adapter.compareAndSwap({
        scope,
        expectedRevision: 0,
        envelope: next,
        context: context()
      })
      return applied.status === 'applied' && stale.status === 'conflict'
    })
  )

  results.push(
    await runCase('atomic_delete', async () => {
      const adapter = await factory()
      await adapter.compareAndSwap({
        scope,
        expectedRevision: null,
        envelope: envelopeFor(scope, 2),
        context: context()
      })
      const stale = await adapter.delete({ scope, expectedRevision: 1, context: context() })
      const deleted = await adapter.delete({ scope, expectedRevision: 2, context: context() })
      const missing = await adapter.read(scope, context())
      return (
        stale.status === 'conflict' &&
        deleted.status === 'deleted' &&
        missing.status === 'not_found'
      )
    })
  )

  results.push(
    await runCase('owner_scope_isolation', async () => {
      const adapter = await factory()
      await adapter.compareAndSwap({
        scope,
        expectedRevision: null,
        envelope: envelopeFor(scope, 0),
        context: context()
      })
      const other = await adapter.read(
        { ...scope, ownerScopeId: OTHER_OWNER_SCOPE },
        context()
      )
      return other.status === 'not_found'
    })
  )

  results.push(
    await runCase('execution_scope_isolation', async () => {
      const adapter = await factory()
      await adapter.compareAndSwap({
        scope,
        expectedRevision: null,
        envelope: envelopeFor(scope, 0),
        context: context()
      })
      const other = await adapter.read(
        { ...scope, executionScopeId: OTHER_EXECUTION_SCOPE },
        context()
      )
      return other.status === 'not_found'
    })
  )

  results.push(
    await runCase('abort_signal_propagation', async () => {
      const adapter = await factory()
      const controller = new AbortController()
      controller.abort()
      try {
        await adapter.read(scope, context(controller.signal))
        return false
      } catch {
        return true
      }
    })
  )

  return {
    passed: results.every(result => result.passed),
    results
  }
}
