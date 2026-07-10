# Phase AI-19 Repair State Contract

## Purpose

Phase AI-19 defines a storage-agnostic, privacy-safe contract for persisting Coordinator repair progress.

Phase AI-18 allowed admission callers to provide executor state. This phase specifies how that state can be serialized, validated, restored, and updated without coupling the deterministic Coordinator layer to a database or background worker.

No persistence adapter is added in this phase.

## Snapshot schema

`CoordinatorRepairStateSnapshot` contains only:

- schema version;
- logical revision;
- completed repair-step ids;
- bounded prior-attempt counters;
- bounded retry-policy metadata.

The snapshot deliberately excludes:

- evidence text;
- claim text;
- URLs;
- policy reasons;
- user identifiers;
- model inputs or outputs;
- wall-clock timestamps.

This minimizes retained data and avoids turning repair-state persistence into a secondary evidence store.

## Versioning

The current schema version is:

```ts
COORDINATOR_REPAIR_STATE_VERSION = 1
```

Unsupported versions fail closed to an empty version-1 snapshot. They are not interpreted using the current schema.

## Bounds and sanitation

The contract:

- trims and de-duplicates stable ids;
- rejects blank ids;
- rejects ids longer than 256 characters instead of truncating them;
- limits completed-step and attempt-map entries to 64 each;
- clamps attempts to the executor maximum;
- clamps retry-policy values to the same safe bounds as the audited executor;
- sorts ids and map keys for deterministic serialization;
- ignores unknown properties.

## Admission conversion

`toCoordinatorAdmissionRepairExecutorState` converts a validated snapshot into the narrow executor-state shape accepted by Coordinator admission.

The conversion cannot supply or replace a bounded repair plan.

## Concurrency and idempotency

`applyCoordinatorRepairStateUpdate` uses optimistic revision checks:

- callers must provide the expected current revision;
- stale or malformed revisions return `revision_conflict` without mutation;
- exhausted revisions return `revision_exhausted`;
- applied mutations increment the revision exactly once;
- updates that do not change the normalized state return `noop` without incrementing the revision.

State transitions are monotonic:

- completed-step ids are unioned and never removed;
- attempt counters use the maximum observed value and never decrease;
- completed steps always retain at least one attempt;
- existing bounded entries are preserved when an adversarial update attempts to overflow the entry limit.

These rules make retries deterministic and reduce duplicate work without pretending to provide distributed locking.

## Safety boundaries

- No database selection or access.
- No filesystem access.
- No network calls.
- No background jobs or timers.
- No repair execution.
- No model or retrieval calls.
- No user-owned object access.
- No live stream behavior changes.

## Regression coverage

Tests cover:

- deterministic empty snapshots;
- malformed runtime sanitation;
- unsupported schema versions;
- privacy-safe field exclusion;
- narrow admission-state conversion;
- monotonic completion and attempt merging;
- idempotent no-op updates;
- stale, malformed, and exhausted revision rejection;
- bounded growth under adversarial input;
- preservation of existing entries during overflow attempts;
- rejection of oversized ids without collision-prone truncation.

## Follow-up

- Define a persistence adapter interface only after ownership, encryption, retention, and deletion requirements are approved.
- Bind snapshots to an authenticated server-side execution scope before storage so one user cannot read or overwrite another user's repair state.
- Add atomic compare-and-swap integration tests for the selected storage backend.
- Keep live repair-worker consumption separate until leases, idempotency keys, timeout behavior, and audit retention are specified.
