# Phase AI-25 Production Repair-State Persistence Contract

## Purpose

Phase AI-25 defines a fail-closed, backend-neutral security contract that a durable Coordinator repair-state persistence implementation must satisfy before it can be approved for production use.

This phase does not select, configure, or connect a database. It prevents production wiring from treating the Phase AI-24 bounded in-memory adapter, process-local atomicity, application-only scope checks, optional transport security, or unverified lifecycle controls as production-safe.

## Contract boundary

`validateCoordinatorRepairStateProductionContract()` accepts untrusted runtime configuration and returns either:

- an immutable normalized contract with `status: approved`; or
- `status: rejected` with allowlisted, privacy-safe reason codes.

The validator does not return submitted values, provider names, endpoints, credentials, record identifiers, owner scope identifiers, execution scope identifiers, or exception messages.

## Required production guarantees

A production adapter declaration must provide all of the following:

- a supported versioned contract;
- a transactional database adapter rather than the in-memory reference adapter;
- durable storage;
- database-level compare-and-swap or serializable transaction atomicity;
- database-enforced owner and execution scope isolation;
- mandatory TLS transport security;
- provider-managed encryption at rest or application envelope encryption;
- runtime secret-manager credentials rather than embedded credentials;
- a bounded integer retention period from 1 through 3,650 days;
- revision-bound hard deletion;
- encrypted, access-controlled backups;
- regularly verified restore procedures;
- a bounded integer recovery-point objective from 1 through 168 hours;
- privacy-safe security-event auditing;
- successful Phase AI-23 conformance verification.

## Adversarial parsing rules

The contract parser fails closed for:

- nulls, primitives, arrays, and class instances;
- inherited contract properties;
- missing or additional properties;
- non-enumerable or accessor properties;
- hostile proxies that throw during reflection;
- fractional, infinite, unsafe, negative, zero, or out-of-range lifecycle values;
- unsupported string values without coercion;
- unverified conformance claims.

Accessors are inspected by descriptor and are never invoked. Approved results are copied into a new frozen object, preventing later caller mutation from changing the accepted declaration.

## IDOR and scope-isolation boundary

Application-level owner and execution scope checks remain mandatory, but they are not sufficient for production approval. A production backend must also enforce both scope identifiers in its database access path and atomic mutation predicate.

A future concrete adapter must demonstrate that:

- reads cannot cross either owner or execution scope;
- compare-and-swap updates bind scope and expected revision in one database operation;
- deletes bind scope and expected revision in one database operation;
- malformed or missing scope identifiers fail closed before backend access;
- database roles cannot broadly bypass tenant predicates during normal application operation;
- conformance and integration tests include cross-owner and cross-execution adversarial cases.

## Retry and ambiguity boundary

Phase AI-22 remains authoritative for persistence operation retry behavior:

- only explicitly transient reads may be retried;
- read retries remain bounded with exponential backoff;
- writes and deletes are not automatically retried because their commit outcome may be ambiguous;
- timeout and cancellation failures collapse to privacy-safe unavailable results.

This contract does not weaken or duplicate that policy.

## Tests

Focused tests cover:

- approval and immutable normalization;
- rejection of the in-memory adapter and every missing production guarantee;
- malformed numeric lifecycle values;
- missing, additional, inherited, accessor, array, and class-instance input;
- hostile proxy behavior;
- mutation isolation;
- prevention of submitted-value leakage in rejection reports.

## Non-goals

Phase AI-25 does not:

- create database tables or migrations;
- choose PostgreSQL, Redis, or another backend;
- configure credentials, TLS certificates, keys, backups, or retention jobs;
- claim that any current deployment satisfies the contract;
- add worker leases, heartbeats, scheduling, or live repair execution;
- access user-owned objects, models, retrieval providers, or the network;
- change live chat or streaming behavior.

## Follow-up

Before a production adapter can be enabled:

1. choose a transactional durable backend and document its threat model;
2. design scoped schema constraints and database roles;
3. implement atomic scoped compare-and-swap and revision-bound deletion;
4. run the Phase AI-23 conformance suite against the real backend;
5. add backend integration tests for concurrency, cancellation, isolation, migrations, backup/restore, and failure recovery;
6. verify the declared security and lifecycle controls in the target deployment rather than relying only on configuration claims;
7. keep worker leases and live repair execution in a separate phase with explicit ownership, expiry, heartbeat, idempotency, concurrency, and audit-retention rules.
