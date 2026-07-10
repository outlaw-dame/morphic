import {
  createCoordinatorRepairStateEnvelope,
  type CoordinatorRepairStateEnvelope,
  type CoordinatorRepairStateScope
} from './repair-state-scope'
import type {
  CoordinatorRepairStatePersistenceAdapter,
  CoordinatorRepairStatePersistenceOperationContext
} from './repair-state-persistence'

const DEFAULT_CASE_TIMEOUT_MS = 2_000
const MIN_CASE_TIMEOUT_MS = 10
const MAX_CASE_TIMEOUT_MS = 30_000

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
  reason?: 'unexpected_result' | 'adapter_error' | 'timeout'
}

export type CoordinatorRepairStatePersistenceConformanceReport = {
  passed: boolean
  results: CoordinatorRepairStatePersistenceConformanceResult[]
}

export type CoordinatorRepairStatePersistenceConformanceFactory = () =>
  | CoordinatorRepairStatePersistenceAdapter
  | Promise<CoordinatorRepairStatePersistenceAdapter>

export type CoordinatorRepairStatePersistenceConformanceOptions = {
  caseTimeoutMs?: number
}

const OWNER_SCOPE = 'conformance_owner_0123456789abcdef'
const OTHER_OWNER_SCOPE = 'conformance_other_owner_0123456789abcdef'
const EXECUTION_SCOPE = 'conformance_execution_0123456789abcdef'
const OTHER_EXECUTION_SCOPE = 'conformance_other_execution_0123456789abcdef'

const scope: CoordinatorRepairStateScope = {
  ownerScopeId: OWNER_SCOPE,
  executionScopeId: EXECUTION_SCOPE
}

class ConformanceTimeoutError extends Error {}

function boundedCaseTimeout(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_CASE_TIMEOUT_MS
  }
  return Math.min(MAX_CASE_TIMEOUT_MS, Math.max(MIN_CASE_TIMEOUT_MS, Math.floor(value)))
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

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new ConformanceTimeoutError()), timeoutMs)
    operation.then(
      value => {
        clearTimeout(timeout)
        resolve(value)
      },
      error => {
        clearTimeout(timeout)
        reject(error)
      }
    )
  })
}

async function runCase(
  testCase: CoordinatorRepairStatePersistenceConformanceCase,
  timeoutMs: number,
  operation: () => Promise<boolean>
): Promise<CoordinatorRepairStatePersistenceConformanceResult> {
  try {
    const passed = await withTimeout(operation(), timeoutMs)
    return passed
      ? { case: testCase, passed: true }
      : { case: testCase, passed: false, reason: 'unexpected_result' }
  } catch (error) {
    return {
      case: testCase,
      passed: false,
      reason: error instanceof ConformanceTimeoutError ? 'timeout' : 'adapter_error'
    }
  }
}

export async function runCoordinatorRepairStatePersistenceConformance(
  factory: CoordinatorRepairStatePersistenceConformanceFactory,
  options: CoordinatorRepairStatePersistenceConformanceOptions = {}
): Promise<CoordinatorRepairStatePersistenceConformanceReport> {
  const timeoutMs = boundedCaseTimeout(options.caseTimeoutMs)
  const results: CoordinatorRepairStatePersistenceConformanceResult[] = []

  results.push(
    await runCase('atomic_create', timeoutMs, async () => {
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
    await runCase('stale_update_rejected', timeoutMs, async () => {
      const adapter = await factory()
      const initial = envelopeFor(scope, 0)
      const next = envelopeFor(scope, 1)
      const created = await adapter.compareAndSwap({
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
      return (
        created.status === 'applied' &&
        applied.status === 'applied' &&
        stale.status === 'conflict'
      )
    })
  )

  results.push(
    await runCase('atomic_delete', timeoutMs, async () => {
      const adapter = await factory()
      const created = await adapter.compareAndSwap({
        scope,
        expectedRevision: null,
        envelope: envelopeFor(scope, 2),
        context: context()
      })
      const stale = await adapter.delete({ scope, expectedRevision: 1, context: context() })
      const deleted = await adapter.delete({ scope, expectedRevision: 2, context: context() })
      const missing = await adapter.read(scope, context())
      return (
        created.status === 'applied' &&
        stale.status === 'conflict' &&
        deleted.status === 'deleted' &&
        missing.status === 'not_found'
      )
    })
  )

  results.push(
    await runCase('owner_scope_isolation', timeoutMs, async () => {
      const adapter = await factory()
      const created = await adapter.compareAndSwap({
        scope,
        expectedRevision: null,
        envelope: envelopeFor(scope, 0),
        context: context()
      })
      const other = await adapter.read(
        { ...scope, ownerScopeId: OTHER_OWNER_SCOPE },
        context()
      )
      return created.status === 'applied' && other.status === 'not_found'
    })
  )

  results.push(
    await runCase('execution_scope_isolation', timeoutMs, async () => {
      const adapter = await factory()
      const created = await adapter.compareAndSwap({
        scope,
        expectedRevision: null,
        envelope: envelopeFor(scope, 0),
        context: context()
      })
      const other = await adapter.read(
        { ...scope, executionScopeId: OTHER_EXECUTION_SCOPE },
        context()
      )
      return created.status === 'applied' && other.status === 'not_found'
    })
  )

  results.push(
    await runCase('abort_signal_propagation', timeoutMs, async () => {
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
