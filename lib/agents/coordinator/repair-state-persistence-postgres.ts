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

const MAX_ENVELOPE_BYTES = 256 * 1024
const CANONICAL_REVISION_PATTERN = /^(0|[1-9]\d*)$/

const READ_SQL = `
SELECT envelope
FROM coordinator_repair_states
WHERE owner_scope_id = $1
  AND execution_scope_id = $2
LIMIT 1
`.trim()

const INSERT_SQL = `
INSERT INTO coordinator_repair_states (
  owner_scope_id,
  execution_scope_id,
  revision,
  envelope
)
VALUES ($1, $2, $3, $4::jsonb)
ON CONFLICT (owner_scope_id, execution_scope_id) DO NOTHING
RETURNING revision
`.trim()

const UPDATE_SQL = `
UPDATE coordinator_repair_states
SET revision = $3,
    envelope = $4::jsonb,
    updated_at = now()
WHERE owner_scope_id = $1
  AND execution_scope_id = $2
  AND revision = $5
RETURNING revision
`.trim()

const DELETE_SQL = `
DELETE FROM coordinator_repair_states
WHERE owner_scope_id = $1
  AND execution_scope_id = $2
  AND revision = $3
RETURNING revision
`.trim()

const EXISTS_SQL = `
SELECT revision
FROM coordinator_repair_states
WHERE owner_scope_id = $1
  AND execution_scope_id = $2
LIMIT 1
`.trim()

export type CoordinatorRepairStatePostgresRow = Readonly<
  Record<string, unknown>
>

export type CoordinatorRepairStatePostgresQuery = (
  statement: string,
  parameters: readonly unknown[],
  context: CoordinatorRepairStatePersistenceOperationContext
) => Promise<readonly CoordinatorRepairStatePostgresRow[]>

export type CoordinatorRepairStatePostgresAdapterOptions = {
  query: CoordinatorRepairStatePostgresQuery
  maxEnvelopeBytes?: number
}

export class CoordinatorRepairStatePostgresUnavailableError extends Error {
  constructor() {
    super('PostgreSQL repair-state persistence is unavailable')
    this.name = 'CoordinatorRepairStatePostgresUnavailableError'
  }
}

function assertActive(
  context: CoordinatorRepairStatePersistenceOperationContext
): void {
  if (!context?.signal || context.signal.aborted) {
    throw new CoordinatorRepairStatePostgresUnavailableError()
  }
}

function validRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function parseRevision(value: unknown): number | null {
  if (validRevision(value)) return value
  if (typeof value === 'bigint') {
    const revision = Number(value)
    return validRevision(revision) ? revision : null
  }
  if (typeof value !== 'string' || !CANONICAL_REVISION_PATTERN.test(value)) {
    return null
  }
  const revision = Number(value)
  return validRevision(revision) ? revision : null
}

function boundedEnvelopeBytes(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    return MAX_ENVELOPE_BYTES
  }
  return Math.min(MAX_ENVELOPE_BYTES, value)
}

function validatedScope(value: unknown): CoordinatorRepairStateScope | null {
  const created = createCoordinatorRepairStateEnvelope(value)
  if (created.status !== 'created') return null
  return {
    ownerScopeId: created.envelope.ownerScopeId,
    executionScopeId: created.envelope.executionScopeId
  }
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

function serializeEnvelope(
  envelope: CoordinatorRepairStateEnvelope,
  maxEnvelopeBytes: number
): string | null {
  try {
    const serialized = JSON.stringify(envelope)
    if (new TextEncoder().encode(serialized).byteLength > maxEnvelopeBytes)
      return null
    return serialized
  } catch {
    return null
  }
}

function singleRow(
  rows: readonly CoordinatorRepairStatePostgresRow[]
): CoordinatorRepairStatePostgresRow | null {
  if (!Array.isArray(rows) || rows.length > 1) {
    throw new CoordinatorRepairStatePostgresUnavailableError()
  }
  const row = rows[0]
  if (row === undefined) return null
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    throw new CoordinatorRepairStatePostgresUnavailableError()
  }
  return row
}

function ownRowValue(
  row: CoordinatorRepairStatePostgresRow,
  key: string
): unknown {
  try {
    if (!Object.hasOwn(row, key)) {
      throw new CoordinatorRepairStatePostgresUnavailableError()
    }
    return Reflect.get(row, key)
  } catch (error) {
    if (error instanceof CoordinatorRepairStatePostgresUnavailableError) {
      throw error
    }
    throw new CoordinatorRepairStatePostgresUnavailableError()
  }
}

function returnedRevision(
  row: CoordinatorRepairStatePostgresRow | null
): number | null {
  return row ? parseRevision(ownRowValue(row, 'revision')) : null
}

export function createCoordinatorRepairStatePostgresAdapter(
  options: CoordinatorRepairStatePostgresAdapterOptions
): CoordinatorRepairStatePersistenceAdapter {
  if (!options || typeof options.query !== 'function') {
    throw new CoordinatorRepairStatePostgresUnavailableError()
  }

  const query = options.query
  const maxEnvelopeBytes = boundedEnvelopeBytes(options.maxEnvelopeBytes)

  return {
    async read(scopeValue, context) {
      assertActive(context)
      const scope = validatedScope(scopeValue)
      if (!scope) throw new CoordinatorRepairStatePostgresUnavailableError()

      const row = singleRow(
        await query(
          READ_SQL,
          [scope.ownerScopeId, scope.executionScopeId],
          context
        )
      )
      assertActive(context)
      if (!row) return { status: 'not_found' }

      const envelope = cloneAuthorizedEnvelope(ownRowValue(row, 'envelope'), scope)
      if (!envelope) throw new CoordinatorRepairStatePostgresUnavailableError()
      return { status: 'found', envelope }
    },

    async compareAndSwap({
      scope: scopeValue,
      expectedRevision,
      envelope,
      context
    }) {
      assertActive(context)
      const scope = validatedScope(scopeValue)
      if (!scope) return { status: 'conflict' }
      if (expectedRevision !== null && !validRevision(expectedRevision)) {
        return { status: 'conflict' }
      }

      const nextEnvelope = cloneAuthorizedEnvelope(envelope, scope)
      if (!nextEnvelope) return { status: 'conflict' }
      if (
        expectedRevision !== null &&
        (expectedRevision === Number.MAX_SAFE_INTEGER ||
          nextEnvelope.snapshot.revision !== expectedRevision + 1)
      ) {
        return { status: 'conflict' }
      }

      const serialized = serializeEnvelope(nextEnvelope, maxEnvelopeBytes)
      if (!serialized) return { status: 'conflict' }

      const parameters = [
        scope.ownerScopeId,
        scope.executionScopeId,
        nextEnvelope.snapshot.revision,
        serialized
      ] as const
      const rows =
        expectedRevision === null
          ? await query(INSERT_SQL, parameters, context)
          : await query(UPDATE_SQL, [...parameters, expectedRevision], context)
      assertActive(context)

      const row = singleRow(rows)
      if (!row) return { status: 'conflict' }
      return returnedRevision(row) === nextEnvelope.snapshot.revision
        ? { status: 'applied' }
        : { status: 'conflict' }
    },

    async delete({ scope: scopeValue, expectedRevision, context }) {
      assertActive(context)
      const scope = validatedScope(scopeValue)
      if (!scope || !validRevision(expectedRevision)) {
        return { status: 'conflict' }
      }

      const deleted = singleRow(
        await query(
          DELETE_SQL,
          [scope.ownerScopeId, scope.executionScopeId, expectedRevision],
          context
        )
      )
      assertActive(context)
      if (deleted) {
        return returnedRevision(deleted) === expectedRevision
          ? { status: 'deleted' }
          : { status: 'conflict' }
      }

      const existing = singleRow(
        await query(
          EXISTS_SQL,
          [scope.ownerScopeId, scope.executionScopeId],
          context
        )
      )
      assertActive(context)
      return existing ? { status: 'conflict' } : { status: 'not_found' }
    }
  }
}
