import { describe, expect, it } from 'vitest'

import { runCoordinatorRepairStatePersistenceConformance } from './repair-state-persistence-conformance'
import {
  createCoordinatorRepairStatePostgresAdapter,
  type CoordinatorRepairStatePostgresQuery,
  type CoordinatorRepairStatePostgresRow
} from './repair-state-persistence-postgres'
import { createCoordinatorRepairStateEnvelope } from './repair-state-scope'

const OWNER_SCOPE = 'postgres_owner_scope_0123456789abcdef'
const EXECUTION_SCOPE = 'postgres_execution_scope_0123456789abcdef'
const scope = {
  ownerScopeId: OWNER_SCOPE,
  executionScopeId: EXECUTION_SCOPE
}

function key(ownerScopeId: unknown, executionScopeId: unknown): string {
  return `${String(ownerScopeId)}\u0000${String(executionScopeId)}`
}

function createFakePostgresQuery(): CoordinatorRepairStatePostgresQuery {
  const records = new Map<string, { revision: number; envelope: unknown }>()

  return async (statement, parameters) => {
    const ownerScopeId = parameters[0]
    const executionScopeId = parameters[1]
    const recordKey = key(ownerScopeId, executionScopeId)

    if (statement.startsWith('SELECT envelope')) {
      const record = records.get(recordKey)
      return record ? [{ envelope: structuredClone(record.envelope) }] : []
    }

    if (statement.startsWith('INSERT INTO')) {
      if (records.has(recordKey)) return []
      const revision = parameters[2]
      const storedEnvelope = JSON.parse(String(parameters[3])) as unknown
      if (typeof revision !== 'number') return []
      records.set(recordKey, { revision, envelope: storedEnvelope })
      return [{ revision: String(revision) }]
    }

    if (statement.startsWith('UPDATE')) {
      const record = records.get(recordKey)
      const revision = parameters[2]
      const expectedRevision = parameters[4]
      if (
        !record ||
        typeof revision !== 'number' ||
        record.revision !== expectedRevision
      ) {
        return []
      }
      const storedEnvelope = JSON.parse(String(parameters[3])) as unknown
      records.set(recordKey, { revision, envelope: storedEnvelope })
      return [{ revision: String(revision) }]
    }

    if (statement.startsWith('DELETE')) {
      const record = records.get(recordKey)
      const expectedRevision = parameters[2]
      if (!record || record.revision !== expectedRevision) return []
      records.delete(recordKey)
      return [{ revision: String(expectedRevision) }]
    }

    if (statement.startsWith('SELECT revision')) {
      const record = records.get(recordKey)
      return record ? [{ revision: String(record.revision) }] : []
    }

    throw new Error('Unexpected SQL statement')
  }
}

function envelope(revision: number, completedStepIds: string[] = []) {
  const created = createCoordinatorRepairStateEnvelope(scope, {
    revision,
    completedStepIds
  })
  if (created.status !== 'created') throw new Error('invalid test scope')
  return created.envelope
}

function context() {
  return { signal: new AbortController().signal, attempt: 1 }
}

describe('Coordinator PostgreSQL repair-state persistence adapter', () => {
  it('passes the backend-neutral persistence conformance suite', async () => {
    const report = await runCoordinatorRepairStatePersistenceConformance(() =>
      createCoordinatorRepairStatePostgresAdapter({
        query: createFakePostgresQuery()
      })
    )

    expect(report.passed).toBe(true)
    expect(report.results.every(result => result.passed)).toBe(true)
  })

  it('binds owner, execution, revision, and payload as parameters', async () => {
    const calls: Array<{
      statement: string
      parameters: readonly unknown[]
    }> = []
    const query: CoordinatorRepairStatePostgresQuery = async (
      statement,
      parameters
    ) => {
      calls.push({ statement, parameters })
      return [{ revision: '0' }]
    }
    const adapter = createCoordinatorRepairStatePostgresAdapter({ query })

    const result = await adapter.compareAndSwap({
      scope,
      expectedRevision: null,
      envelope: envelope(0),
      context: context()
    })

    expect(result).toEqual({ status: 'applied' })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.statement).toContain('$1')
    expect(calls[0]?.statement).toContain('$4::jsonb')
    expect(calls[0]?.statement).not.toContain(OWNER_SCOPE)
    expect(calls[0]?.statement).not.toContain(EXECUTION_SCOPE)
    expect(calls[0]?.parameters.slice(0, 3)).toEqual([
      OWNER_SCOPE,
      EXECUTION_SCOPE,
      0
    ])
  })

  it('rejects cross-scope envelopes before querying the database', async () => {
    let calls = 0
    const query: CoordinatorRepairStatePostgresQuery = async () => {
      calls += 1
      return []
    }
    const adapter = createCoordinatorRepairStatePostgresAdapter({ query })
    const other = createCoordinatorRepairStateEnvelope(
      {
        ownerScopeId: 'postgres_other_owner_0123456789abcdef',
        executionScopeId: EXECUTION_SCOPE
      },
      { revision: 0 }
    )
    if (other.status !== 'created') throw new Error('invalid test scope')

    const result = await adapter.compareAndSwap({
      scope,
      expectedRevision: null,
      envelope: other.envelope,
      context: context()
    })

    expect(result).toEqual({ status: 'conflict' })
    expect(calls).toBe(0)
  })

  it('rejects oversized normalized envelopes before issuing SQL', async () => {
    let calls = 0
    const query: CoordinatorRepairStatePostgresQuery = async () => {
      calls += 1
      return []
    }
    const adapter = createCoordinatorRepairStatePostgresAdapter({
      query,
      maxEnvelopeBytes: 128
    })
    const largeEnvelope = envelope(0, ['x'.repeat(256)])

    const result = await adapter.compareAndSwap({
      scope,
      expectedRevision: null,
      envelope: largeEnvelope,
      context: context()
    })

    expect(result).toEqual({ status: 'conflict' })
    expect(calls).toBe(0)
  })

  it('fails closed for malformed or duplicate backend rows', async () => {
    const malformedRows: readonly (readonly CoordinatorRepairStatePostgresRow[])[] = [
      [{ envelope: { unexpected: true } }],
      [{ envelope: envelope(0) }, { envelope: envelope(0) }]
    ]

    for (const rows of malformedRows) {
      const adapter = createCoordinatorRepairStatePostgresAdapter({
        query: async () => rows
      })

      await expect(adapter.read(scope, context())).rejects.toThrow(
        'PostgreSQL repair-state persistence is unavailable'
      )
    }
  })

  it('rejects malformed bigint revision results', async () => {
    for (const revision of ['01', '-1', '9007199254740992', 1.5]) {
      const adapter = createCoordinatorRepairStatePostgresAdapter({
        query: async () => [{ revision }]
      })

      const result = await adapter.compareAndSwap({
        scope,
        expectedRevision: null,
        envelope: envelope(0),
        context: context()
      })
      expect(result).toEqual({ status: 'conflict' })
    }
  })

  it('does not query when the operation is already aborted', async () => {
    let calls = 0
    const adapter = createCoordinatorRepairStatePostgresAdapter({
      query: async () => {
        calls += 1
        return []
      }
    })
    const controller = new AbortController()
    controller.abort()

    await expect(
      adapter.read(scope, { signal: controller.signal, attempt: 1 })
    ).rejects.toThrow('PostgreSQL repair-state persistence is unavailable')
    expect(calls).toBe(0)
  })
})
