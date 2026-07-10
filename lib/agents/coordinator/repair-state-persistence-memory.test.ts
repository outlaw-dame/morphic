import { describe, expect, it } from 'vitest'

import { runCoordinatorRepairStatePersistenceConformance } from './repair-state-persistence-conformance'
import {
  createCoordinatorRepairStateInMemoryAdapter,
  CoordinatorRepairStateInMemoryUnavailableError
} from './repair-state-persistence-memory'
import {
  createCoordinatorRepairStateEnvelope,
  readCoordinatorRepairStateEnvelope,
  type CoordinatorRepairStateEnvelope,
  type CoordinatorRepairStateScope
} from './repair-state-scope'

const scope: CoordinatorRepairStateScope = {
  ownerScopeId: 'owner_scope_0123456789abcdef',
  executionScopeId: 'execution_scope_0123456789abcdef'
}

const otherScope: CoordinatorRepairStateScope = {
  ownerScopeId: 'owner_scope_fedcba9876543210',
  executionScopeId: 'execution_scope_fedcba9876543210'
}

function context(signal: AbortSignal = new AbortController().signal) {
  return { signal, attempt: 1 }
}

function envelopeFor(
  targetScope: CoordinatorRepairStateScope,
  revision: number,
  completedStepIds: string[] = []
): CoordinatorRepairStateEnvelope {
  const created = createCoordinatorRepairStateEnvelope(targetScope, {
    revision,
    completedStepIds
  })
  if (created.status !== 'created') throw new Error('invalid test scope')
  return created.envelope
}

function envelopeWithRawRevision(revision: unknown): CoordinatorRepairStateEnvelope {
  const base = envelopeFor(scope, 0)
  return {
    ...base,
    snapshot: {
      ...base.snapshot,
      revision
    }
  } as unknown as CoordinatorRepairStateEnvelope
}

describe('bounded in-memory Coordinator repair-state persistence adapter', () => {
  it('passes the backend-neutral persistence conformance contract', async () => {
    const report = await runCoordinatorRepairStatePersistenceConformance(() =>
      createCoordinatorRepairStateInMemoryAdapter()
    )

    expect(report.passed).toBe(true)
    expect(report.results.every(result => result.passed)).toBe(true)
  })

  it('defensively clones writes and reads to prevent mutation aliasing', async () => {
    const adapter = createCoordinatorRepairStateInMemoryAdapter()
    const original = envelopeFor(scope, 0, ['step_one'])

    await expect(
      adapter.compareAndSwap({
        scope,
        expectedRevision: null,
        envelope: original,
        context: context()
      })
    ).resolves.toEqual({ status: 'applied' })

    original.snapshot.completedStepIds.push('mutated_after_write')

    const firstRead = await adapter.read(scope, context())
    expect(firstRead.status).toBe('found')
    if (firstRead.status !== 'found') throw new Error('expected stored envelope')

    const firstEnvelope = firstRead.envelope as CoordinatorRepairStateEnvelope
    expect(firstEnvelope.snapshot.completedStepIds).toEqual(['step_one'])
    firstEnvelope.snapshot.completedStepIds.push('mutated_after_read')

    const secondRead = await adapter.read(scope, context())
    expect(secondRead.status).toBe('found')
    if (secondRead.status !== 'found') throw new Error('expected stored envelope')
    expect(
      (secondRead.envelope as CoordinatorRepairStateEnvelope).snapshot.completedStepIds
    ).toEqual(['step_one'])
  })

  it('enforces bounded capacity and releases capacity after revision-bound deletion', async () => {
    const adapter = createCoordinatorRepairStateInMemoryAdapter({ maxEntries: 1 })

    await expect(
      adapter.compareAndSwap({
        scope,
        expectedRevision: null,
        envelope: envelopeFor(scope, 0),
        context: context()
      })
    ).resolves.toEqual({ status: 'applied' })

    await expect(
      adapter.compareAndSwap({
        scope: otherScope,
        expectedRevision: null,
        envelope: envelopeFor(otherScope, 0),
        context: context()
      })
    ).rejects.toBeInstanceOf(CoordinatorRepairStateInMemoryUnavailableError)

    await expect(
      adapter.delete({ scope, expectedRevision: 0, context: context() })
    ).resolves.toEqual({ status: 'deleted' })

    await expect(
      adapter.compareAndSwap({
        scope: otherScope,
        expectedRevision: null,
        envelope: envelopeFor(otherScope, 0),
        context: context()
      })
    ).resolves.toEqual({ status: 'applied' })
  })

  it('fails closed for aborted operations and malformed revisions or cross-scope envelopes', async () => {
    const adapter = createCoordinatorRepairStateInMemoryAdapter()
    const controller = new AbortController()
    controller.abort()

    await expect(adapter.read(scope, context(controller.signal))).rejects.toBeInstanceOf(
      CoordinatorRepairStateInMemoryUnavailableError
    )

    await expect(
      adapter.compareAndSwap({
        scope,
        expectedRevision: Number.POSITIVE_INFINITY,
        envelope: envelopeFor(scope, 0),
        context: context()
      })
    ).resolves.toEqual({ status: 'conflict' })

    await expect(
      adapter.compareAndSwap({
        scope,
        expectedRevision: null,
        envelope: envelopeFor(otherScope, 0),
        context: context()
      })
    ).resolves.toEqual({ status: 'conflict' })

    await expect(
      adapter.delete({ scope, expectedRevision: -1, context: context() })
    ).resolves.toEqual({ status: 'conflict' })
  })

  it('rejects malformed raw envelope revisions without sanitizing or mutating state', async () => {
    const malformedCreateRevisions = [
      -1,
      1.5,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1
    ]

    for (const revision of malformedCreateRevisions) {
      const malformedEnvelope = envelopeWithRawRevision(revision)
      expect(readCoordinatorRepairStateEnvelope(malformedEnvelope, scope)).toEqual({
        status: 'denied',
        reason: 'scope_denied'
      })

      const adapter = createCoordinatorRepairStateInMemoryAdapter()
      await expect(
        adapter.compareAndSwap({
          scope,
          expectedRevision: null,
          envelope: malformedEnvelope,
          context: context()
        })
      ).resolves.toEqual({ status: 'conflict' })
      await expect(adapter.read(scope, context())).resolves.toEqual({ status: 'not_found' })
    }

    const adapter = createCoordinatorRepairStateInMemoryAdapter()
    await expect(
      adapter.compareAndSwap({
        scope,
        expectedRevision: null,
        envelope: envelopeFor(scope, 0),
        context: context()
      })
    ).resolves.toEqual({ status: 'applied' })

    await expect(
      adapter.compareAndSwap({
        scope,
        expectedRevision: 0,
        envelope: envelopeWithRawRevision(1.5),
        context: context()
      })
    ).resolves.toEqual({ status: 'conflict' })

    const current = await adapter.read(scope, context())
    expect(current.status).toBe('found')
    if (current.status !== 'found') throw new Error('expected stored envelope')
    expect((current.envelope as CoordinatorRepairStateEnvelope).snapshot.revision).toBe(0)
  })

  it('requires monotonic stored revisions for compare-and-swap updates', async () => {
    const adapter = createCoordinatorRepairStateInMemoryAdapter()

    await expect(
      adapter.compareAndSwap({
        scope,
        expectedRevision: null,
        envelope: envelopeFor(scope, 0),
        context: context()
      })
    ).resolves.toEqual({ status: 'applied' })

    await expect(
      adapter.compareAndSwap({
        scope,
        expectedRevision: 0,
        envelope: envelopeFor(scope, 2),
        context: context()
      })
    ).resolves.toEqual({ status: 'conflict' })

    await expect(
      adapter.compareAndSwap({
        scope,
        expectedRevision: 0,
        envelope: envelopeFor(scope, 1),
        context: context()
      })
    ).resolves.toEqual({ status: 'applied' })
  })
})
