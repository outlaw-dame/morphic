# Phase AI-21 Repair State Persistence Adapter

## Purpose

Phase AI-21 defines a storage-agnostic persistence boundary for scoped Coordinator repair state.

It builds on Phase AI-20 scope binding and does not select or connect to a database, filesystem, cache, or remote service.

## Adapter contract

`CoordinatorRepairStatePersistenceAdapter` requires three operations:

- `read(scope)`;
- `compareAndSwap({ scope, expectedRevision, envelope })`;
- `delete({ scope, expectedRevision })`.

Every operation receives a validated owner and execution scope. The Coordinator wrapper rejects malformed scope input before invoking an adapter.

## Atomicity

Writes use compare-and-swap semantics:

- `expectedRevision: null` means create only when no record exists;
- a numeric expected revision means replace only when the stored revision still matches;
- adapter conflicts are returned as `revision_conflict`;
- idempotent updates do not call the adapter write path.

Deletion also requires the currently observed revision and must be atomic in a backend implementation.

The Coordinator layer does not retry compare-and-swap conflicts automatically. Blind retries could overwrite concurrent progress or repeat caller intent. Callers must re-read, reevaluate, and submit a new bounded update.

## Authorization and IDOR boundaries

- Scope identifiers must come from trusted authentication and authorization code.
- Malformed scope values fail closed before storage access.
- Stored envelopes are revalidated against the authenticated scope after every read.
- A cross-scope or malformed stored value returns only `scope_denied`.
- Adapter keys and backend existence details are never exposed by the Coordinator wrapper.
- Snapshot and update payloads cannot replace the trusted scope.

## Error handling

Adapter exceptions are caught and collapsed to:

```ts
{
  status: 'unavailable',
  reason: 'persistence_unavailable'
}
```

Raw database errors, storage keys, connection details, stack traces, and tenant identifiers are not returned.

## Backend requirements

A production adapter must provide:

- encrypted storage at rest;
- transport encryption where a remote backend is used;
- atomic create/update/delete compare-and-swap operations;
- cross-tenant key isolation;
- least-privilege service credentials;
- explicit retention and deletion policy;
- bounded timeouts and cancellation;
- retry behavior limited to demonstrably idempotent transport failures;
- audit logging that excludes scope secrets and snapshot content.

## Regression coverage

Tests cover:

- rejection before adapter access for malformed scope input;
- scope-bound validation of stored envelopes;
- cross-scope denial without object disclosure;
- atomic create compare-and-swap behavior;
- revision-bound update compare-and-swap behavior;
- no persistence write for idempotent updates;
- revision-bound deletion;
- privacy-safe adapter exception handling.

## Safety boundaries

- No concrete backend.
- No database or filesystem access.
- No network calls.
- No automatic CAS retry loop.
- No repair execution.
- No model or retrieval calls.
- No user-owned object access.
- No live stream behavior changes.

## Follow-up

- Select a backend only after encryption, retention, deletion, and operational ownership requirements are approved.
- Add adapter conformance tests for atomic compare-and-swap, tenant isolation, cancellation, timeout handling, and idempotent transport retry behavior.
- Keep worker leases and repair execution separate until lease ownership, expiry, heartbeat, idempotency, and audit retention are specified.
