# Phase AI-24 Bounded In-Memory Persistence

## Purpose

Phase AI-24 adds a bounded in-memory reference implementation of the Coordinator repair-state persistence adapter.

The adapter is intended for tests, local development, and backend-contract validation. It is not durable and is not approved for production repair-state storage.

## Guarantees

The adapter provides:

- owner and execution scope isolation;
- create-only and revision-bound compare-and-swap behavior;
- revision-bound deletion;
- defensive cloning on writes and reads;
- rejection of malformed scopes, revisions, and cross-scope envelopes;
- already-aborted operation handling;
- configurable bounded entry capacity;
- monotonic stored revision enforcement.

## Capacity policy

The adapter accepts an optional `maxEntries` setting.

- default: 1,000 entries;
- minimum: 1 entry;
- hard maximum: 10,000 entries;
- malformed values fall back to the default;
- new-scope creation fails closed when capacity is exhausted;
- deletion immediately releases one entry slot.

Capacity exhaustion throws only a coarse in-memory-unavailable error. When used through the Phase AI-21/22 persistence wrapper, that error is collapsed to the existing privacy-safe `persistence_unavailable` result.

## Mutation isolation

Incoming envelopes are revalidated against the authenticated scope and cloned before storage. Reads return a fresh validated clone.

This prevents callers from mutating persisted state by retaining references to:

- the envelope supplied to `compareAndSwap`;
- an envelope returned by `read`;
- nested completed-step arrays;
- nested prior-attempt or retry-policy objects.

## Atomicity model

Map inspection and mutation occur synchronously without an intervening `await`. Within one JavaScript process, create, update, and delete checks therefore form one uninterrupted critical section.

This does not provide cross-process, cross-worker, or distributed atomicity. Production backends must provide their own database-level compare-and-swap or transactional primitive and pass the Phase AI-23 conformance suite.

## Revision behavior

- create requires no existing record and a valid non-negative safe snapshot revision;
- update requires the stored revision to equal `expectedRevision`;
- update requires the replacement revision to equal `expectedRevision + 1`;
- delete requires the stored revision to equal `expectedRevision`;
- negative, fractional, infinite, unsafe, or otherwise malformed revisions fail closed.

Allowing a valid non-zero initial revision supports restoring or importing an already-versioned snapshot without weakening create-only compare-and-swap semantics.

## Conformance and regression coverage

Tests verify:

- the adapter passes every Phase AI-23 conformance case;
- input and output mutation aliasing cannot modify stored state;
- capacity exhaustion and capacity release;
- cancellation behavior;
- malformed revision rejection;
- cross-scope envelope rejection;
- monotonic revision enforcement.

## Safety boundaries

- No database or filesystem access.
- No network calls.
- No credentials or environment configuration.
- No encryption-at-rest claim.
- No durability, backup, restore, or retention claim.
- No background cleanup or timers.
- No repair execution, retrieval, model, or user-owned object access.
- No live stream behavior changes.

## Follow-up

- Select a production backend only after ownership, encryption-at-rest, retention, deletion, backup, restore, and credential-rotation requirements are approved.
- Run the Phase AI-23 conformance suite plus backend-specific integration tests against every proposed production adapter.
- Keep worker leases and live repair execution separate until lease ownership, expiry, heartbeat, idempotency, concurrency, and audit-retention rules are specified.
