# Phase AI-26 PostgreSQL Repair-State Persistence

## Purpose

Phase AI-26 adds the first concrete durable persistence implementation for Coordinator repair state. PostgreSQL is selected because Morphic already uses PostgreSQL, Drizzle, migrations, restricted database roles, TLS configuration, and row-level security.

This phase implements the storage schema, migration, fixed parameterized SQL adapter, backend-neutral conformance coverage, and adversarial unit tests. It does not enable the adapter in a production deployment or claim that operational controls such as backup verification, credential rotation, retention jobs, or disaster recovery are complete.

## Storage model

`coordinator_repair_states` uses a composite primary key:

- `owner_scope_id`
- `execution_scope_id`

The table stores:

- the safe-integer repair-state revision as `bigint`;
- the normalized scoped envelope as `jsonb`;
- creation and update timestamps.

Database checks bind the JSON envelope to the relational columns:

- envelope version must be `1`;
- envelope owner scope must equal `owner_scope_id`;
- envelope execution scope must equal `execution_scope_id`;
- envelope snapshot must be an object;
- envelope snapshot revision must be numeric and equal the relational revision;
- scope identifiers must remain between 16 and 256 characters;
- revisions must remain between `0` and JavaScript's maximum safe integer.

These checks prevent a malformed or cross-scope envelope from being persisted even if application validation is bypassed.

## Atomicity

Creation uses one `INSERT ... ON CONFLICT DO NOTHING RETURNING revision` statement.

Updates use one `UPDATE ... WHERE owner_scope_id = $1 AND execution_scope_id = $2 AND revision = $5 RETURNING revision` statement. The owner scope, execution scope, and expected revision are therefore part of the same database mutation predicate.

Deletes use one scope-and-revision-bound `DELETE ... RETURNING revision` statement. When no row is deleted, a scoped existence read distinguishes a currently missing record from a revision conflict. The result reflects the database state observed by that follow-up read; callers must not automatically retry deletes because the first mutation outcome may be ambiguous after transport failure.

## IDOR defenses

The implementation layers four controls:

1. scope identifiers are validated before database access;
2. cross-scope envelopes are rejected before SQL execution;
3. every SQL statement binds both owner and execution scope as parameters;
4. PostgreSQL RLS requires transaction-local `app.current_owner_scope_id` and `app.current_execution_scope_id` values to match the row.

The migration enables and forces RLS. The policy is permissive because PostgreSQL requires at least one permissive policy before restrictive policies can admit rows; the policy predicate itself requires exact equality for both scope dimensions.

The production query implementation must set both RLS settings transaction-locally before executing adapter SQL. Missing settings fail closed under the restricted database role. Superuser and `BYPASSRLS` roles must not be used by normal application traffic.

## Query boundary

The adapter accepts a narrow `CoordinatorRepairStatePostgresQuery` port instead of owning global credentials or opening connections itself. This keeps:

- credentials outside the adapter;
- SQL fixed and parameterized;
- transaction and RLS context under the database integration layer;
- tests deterministic without a live database;
- network retries outside mutation logic.

The query implementation must return at most one row for each adapter statement and must preserve cancellation context. Duplicate or malformed rows fail closed.

## Payload and parsing hardening

Before SQL execution, the adapter:

- revalidates and clones the scoped envelope;
- enforces monotonic update revisions;
- rejects revision exhaustion;
- serializes a normalized envelope only;
- enforces a configurable payload bound capped at 256 KiB;
- accepts only safe numeric revisions or canonical decimal bigint strings returned by the driver;
- rejects duplicate rows, malformed rows, accessors, noncanonical bigint strings, and unsafe revisions;
- emits no credentials, payloads, scope identifiers, SQL parameters, or backend exception details.

## Retry and cancellation policy

Phase AI-22 remains authoritative:

- only explicitly transient reads may receive bounded exponential-backoff retries;
- creates, updates, and deletes are not automatically retried;
- an abort observed before SQL prevents database access;
- an abort observed after SQL returns causes the operation to fail unavailable rather than claim success;
- callers must reconcile ambiguous mutation outcomes with a fresh scoped read.

## Tests

The tests run the Phase AI-23 conformance suite against an isolated PostgreSQL behavior simulator and add coverage for:

- atomic create, stale update rejection, revision-bound delete, and scope isolation;
- parameter binding without scope interpolation into SQL;
- cross-scope rejection before database access;
- normalized payload-size enforcement;
- malformed and duplicate backend rows;
- canonical bigint revision parsing;
- abort-before-query behavior.

A real PostgreSQL integration test remains required before production enablement. It must exercise migrations, forced RLS, restricted roles, transaction-local scope settings, concurrent writers, cancellation, connection loss, and migration rollback/restore procedures.

## Non-goals

Phase AI-26 does not:

- wire the adapter into live Coordinator execution;
- add database credentials or secret-manager configuration;
- disable the Phase AI-24 in-memory reference adapter;
- automatically retry writes or deletes;
- implement retention deletion jobs, backup jobs, or restore automation;
- add worker leases, heartbeats, scheduling, or live repair execution;
- claim Phase AI-25 production approval based only on this code.

## Follow-up

Phase AI-27 should add the restricted PostgreSQL query integration and real-database integration suite. Production admission must remain fail closed until the deployed environment verifies TLS, encryption at rest, restricted roles, RLS behavior, migration state, retention, backup/restore, credential rotation, and Phase AI-23 conformance against the real backend.
