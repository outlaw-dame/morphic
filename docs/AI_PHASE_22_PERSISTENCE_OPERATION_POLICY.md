# Phase AI-22 Persistence Operation Policy

## Purpose

Phase AI-22 adds bounded operational controls to the Phase AI-21 repair-state persistence adapter contract.

It does not select or connect to a database, filesystem, cache, or remote service. The phase defines how Coordinator persistence calls must behave when adapters are slow, cancelled, or temporarily unavailable.

## Operation context

Every adapter operation receives a `CoordinatorRepairStatePersistenceOperationContext` containing:

- an `AbortSignal` scoped to that individual operation;
- a one-based attempt number.

A production adapter must stop work promptly when the signal is aborted and must not reuse the signal outside that operation.

## Bounded timeouts

Each read, compare-and-swap, and delete call is wrapped in a bounded timeout.

- default timeout: 5 seconds;
- minimum timeout: 1 millisecond;
- hard maximum timeout: 30 seconds;
- caller cancellation aborts the active operation immediately;
- timeout and cancellation results are collapsed to `persistence_unavailable`.

The wrapper races non-cooperative adapters so callers are not held indefinitely. Adapters must still honor the provided signal to release their own sockets, locks, transactions, or other resources.

## Retry policy

Only reads may be retried, because reads are side-effect free under the adapter contract.

A read is retryable only when the adapter throws the explicit `CoordinatorRepairStateTransientReadError` marker. Ordinary errors, timeouts, cancellations, malformed data, and authorization failures are not retried.

Read retries use bounded exponential backoff:

- default maximum read attempts: 2;
- hard maximum read attempts: 3;
- default base delay: 100 milliseconds;
- default maximum delay: 1 second;
- hard delay cap: 5 seconds;
- no retry occurs after caller cancellation.

## Ambiguous writes

Compare-and-swap writes and deletes are never retried automatically.

A transport failure can occur after a backend committed a mutation but before the response reached the caller. Retrying that operation blindly could repeat intent, overwrite concurrent progress, or delete newly replaced state.

After an unavailable write or delete, callers must read authoritative state and decide whether to submit a new bounded operation.

## Revision validation

Deletion revisions must be non-negative safe integers. Fractional, negative, infinite, and unsafe revision values return `revision_conflict` before adapter access.

## Privacy and security behavior

- malformed scopes are rejected before adapter access;
- stored envelopes remain scope-revalidated after reads;
- backend exception messages and stack traces do not escape;
- cancellation and timeout details are not exposed as object-existence signals;
- retry markers do not contain backend data;
- no automatic mutation retry can cross tenant or execution boundaries.

## Regression coverage

Tests cover:

- explicit transient-read retries;
- bounded exponential retry delays;
- no retry for ordinary read errors;
- timeout of a non-cooperative adapter;
- operation-signal abortion on timeout;
- caller cancellation during retry backoff;
- no automatic retry for compare-and-swap writes;
- no automatic retry for deletes;
- malformed deletion revision rejection before adapter access.

## Safety boundaries

- No concrete backend.
- No database or filesystem access.
- No network calls.
- No background worker.
- No repair execution.
- No model or retrieval calls.
- No user-owned object access.
- No live stream behavior changes.

## Follow-up

- Add a reusable adapter conformance suite for atomic compare-and-swap, tenant isolation, signal handling, and mutation ambiguity.
- Select a concrete backend only after encryption, retention, deletion, backup, and operational ownership requirements are approved.
- Keep worker leases and repair execution separate until lease ownership, expiry, heartbeat, idempotency, and audit retention are specified.
