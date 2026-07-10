import { InferSelectModel, sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  jsonb,
  pgPolicy,
  pgTable,
  timestamp,
  varchar
} from 'drizzle-orm/pg-core'

import type { CoordinatorRepairStateEnvelope } from '@/lib/agents/coordinator/repair-state-scope'

const SCOPE_ID_LENGTH = 256
const MAX_SAFE_REVISION = Number.MAX_SAFE_INTEGER

export const coordinatorRepairStates = pgTable(
  'coordinator_repair_states',
  {
    ownerScopeId: varchar('owner_scope_id', { length: SCOPE_ID_LENGTH }).notNull(),
    executionScopeId: varchar('execution_scope_id', {
      length: SCOPE_ID_LENGTH
    }).notNull(),
    revision: bigint('revision', { mode: 'number' }).notNull(),
    envelope: jsonb('envelope').$type<CoordinatorRepairStateEnvelope>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    {
      name: 'coordinator_repair_states_pk',
      columns: [table.ownerScopeId, table.executionScopeId]
    },
    index('coordinator_repair_states_updated_at_idx').on(table.updatedAt),
    check(
      'coordinator_repair_states_owner_scope_length',
      sql`char_length(${table.ownerScopeId}) BETWEEN 16 AND 256`
    ),
    check(
      'coordinator_repair_states_execution_scope_length',
      sql`char_length(${table.executionScopeId}) BETWEEN 16 AND 256`
    ),
    check(
      'coordinator_repair_states_revision_range',
      sql`${table.revision} BETWEEN 0 AND ${MAX_SAFE_REVISION}`
    ),
    check(
      'coordinator_repair_states_envelope_owner_scope',
      sql`${table.envelope} ->> 'ownerScopeId' = ${table.ownerScopeId}`
    ),
    check(
      'coordinator_repair_states_envelope_execution_scope',
      sql`${table.envelope} ->> 'executionScopeId' = ${table.executionScopeId}`
    ),
    check(
      'coordinator_repair_states_envelope_revision',
      sql`jsonb_typeof(${table.envelope} -> 'snapshot' -> 'revision') = 'number'
        AND (${table.envelope} -> 'snapshot' ->> 'revision')::numeric = ${table.revision}`
    ),
    pgPolicy('coordinator_repair_states_scoped_access', {
      as: 'restrictive',
      for: 'all',
      to: 'public',
      using: sql`${table.ownerScopeId} = current_setting('app.current_owner_scope_id', true)
        AND ${table.executionScopeId} = current_setting('app.current_execution_scope_id', true)`,
      withCheck: sql`${table.ownerScopeId} = current_setting('app.current_owner_scope_id', true)
        AND ${table.executionScopeId} = current_setting('app.current_execution_scope_id', true)`
    })
  ]
).enableRLS()

export type CoordinatorRepairStateRecord = InferSelectModel<
  typeof coordinatorRepairStates
>
