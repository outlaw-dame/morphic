# Phase AI-23 Persistence Adapter Conformance

## Purpose

Phase AI-23 adds a reusable, backend-neutral conformance runner for Coordinator repair-state persistence adapters.

It validates the behavioral contract introduced by Phases AI-21 and AI-22 before a concrete database, filesystem, cache, or remote adapter is approved.

## Covered guarantees

The runner exercises a fresh adapter instance for each case and verifies:

- create-only compare-and-swap is atomic;
- stale revision updates are rejected;
- deletion is revision-bound and atomic;
- owner scopes cannot observe another owner's state;
- execution scopes cannot observe another execution's state;
- already-aborted operation signals are honored.

## Bounded execution

Each conformance case has an independent timeout:

- default: 2 seconds;
- minimum: 10 milliseconds;
- maximum: 30 seconds.

A hanging or non-cooperative adapter therefore fails with the coarse reason `timeout` instead of blocking the entire suite indefinitely.

## Privacy-safe reporting

Reports contain only:

- a fixed allowlisted case name;
- pass/fail state;
- one coarse reason: `unexpected_result`, `adapter_error`, or `timeout`.

Reports exclude:

- owner or execution scope identifiers;
- storage keys;
- snapshots or envelopes;
- revisions;
- backend exception messages or stack traces;
- connection details or tenant metadata.

## Factory isolation

The runner requires a factory rather than a shared adapter instance. Every case receives a fresh adapter so state from one scenario cannot mask defects in another.

Concrete adapter conformance jobs must provision an isolated disposable namespace or transaction for each factory call and destroy it afterward.

## Regression coverage

Tests include:

- a compliant in-memory reference adapter;
- a deliberately stale-write-accepting adapter;
- a deliberately cross-owner-aliasing adapter;
- a non-cooperative adapter that is bounded by case timeouts;
- verification that reports do not contain fixture scope values.

## Safety boundaries

- No production persistence backend.
- No database or filesystem access.
- No network calls.
- No credentials or environment configuration.
- No mutation retries.
- No repair execution, retrieval, model, or user-owned object access.
- No live stream behavior changes.

## Follow-up

- Run this conformance contract against each proposed concrete adapter in an isolated integration environment.
- Add backend-specific encryption-at-rest, retention, deletion, backup, restore, and credential-rotation tests before production approval.
- Keep worker leases and repair execution separate until lease ownership, expiry, heartbeat, idempotency, and audit retention are specified.
