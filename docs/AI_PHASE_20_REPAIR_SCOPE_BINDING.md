# Phase AI-20 Repair State Scope Binding

## Purpose

Phase AI-20 binds Coordinator repair-state snapshots to an authenticated execution scope before any persistence adapter is introduced.

Phase AI-19 defined a versioned, storage-agnostic snapshot. This phase adds a separate envelope contract that prevents one authenticated scope from reading or mutating another scope's repair state.

No database or filesystem adapter is added.

## Scope model

A scope contains two opaque server-derived identifiers:

- `ownerScopeId`, representing the authenticated ownership boundary;
- `executionScopeId`, representing one bounded repair execution context.

These values must be generated or resolved by trusted server-side authentication and authorization code. They are not accepted as proof of identity merely because a client supplied them.

The scope contract rejects identifiers that are:

- shorter than 16 characters;
- longer than 256 characters;
- blank after trimming;
- contaminated with control characters.

## Envelope schema

`CoordinatorRepairStateEnvelope` contains:

- envelope schema version;
- opaque owner scope id;
- opaque execution scope id;
- sanitized Phase AI-19 repair-state snapshot.

Evidence text, claim text, URLs, user profile data, model content, policy reasons, and wall-clock timestamps remain excluded.

## Authorization behavior

The contract exposes:

- `createCoordinatorRepairStateEnvelope`;
- `readCoordinatorRepairStateEnvelope`;
- `applyCoordinatorRepairStateEnvelopeUpdate`.

Reads and updates require an authenticated scope that exactly matches both envelope scope identifiers.

Malformed envelopes, malformed authenticated scopes, owner mismatches, and execution mismatches all return the same result:

```ts
{
  status: 'denied',
  reason: 'scope_denied'
}
```

This intentionally avoids revealing whether a repair-state object exists, which owner it belongs to, or which revision it contains.

## IDOR hardening

The contract prevents direct-object-reference bypasses by:

- requiring both ownership and execution scope matches;
- comparing bounded scope identifiers without early-return character comparison;
- never authorizing from scope fields embedded inside snapshot or update payloads;
- preserving envelope scope fields across authorized updates;
- returning no snapshot or revision metadata on denied access;
- rejecting unsupported envelope versions instead of interpreting them as the current schema.

Storage adapters must still derive the authenticated scope from trusted server-side identity and authorization state. A caller-controlled scope object must never be treated as authentication.

## Safety boundaries

- No database selection or access.
- No filesystem access.
- No network calls.
- No background workers or timers.
- No repair execution.
- No retrieval or model calls.
- No user-owned object access.
- No live stream behavior changes.

## Regression coverage

Tests cover:

- valid envelope creation and read access;
- snapshot sanitation and privacy-safe field exclusion;
- owner-scope mismatch denial;
- execution-scope mismatch denial;
- malformed and unsupported envelope denial;
- weak, oversized, and control-character scope rejection;
- authorized monotonic state updates;
- denial without snapshot or revision disclosure;
- resistance to adversarial scope fields embedded in snapshot and update payloads.

## Follow-up

- Define a persistence adapter interface that requires trusted authenticated scope input on every read, compare-and-swap update, and deletion.
- Require encrypted storage and explicit retention/deletion policy before selecting a backend.
- Add backend-specific atomic compare-and-swap and cross-tenant isolation tests.
- Keep live worker leases and execution consumption separate until idempotency keys, lease expiry, timeout handling, and audit retention are specified.
