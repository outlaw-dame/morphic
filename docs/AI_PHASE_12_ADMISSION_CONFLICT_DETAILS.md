# Phase AI-12 Admission Conflict Details

## Purpose

Phase AI-12 exposes structured evidence conflict metadata through the Coordinator admission bridge.

Phase AI-11 made structured evidence conflicts drive the contradiction policy. That gave policy evaluation enough information to decide whether composition should continue, but callers of the admission bridge still had to inspect raw policy results to understand exactly which evidence items disagreed. This phase adds a small, stable admission-level view for those details.

## What changed

`CoordinatorAdmission` now includes:

```ts
conflictDetails: CoordinatorAdmissionConflictDetail[]
```

Each admission conflict detail is copied from structured policy detail metadata and includes the policy that produced it:

```ts
type CoordinatorAdmissionConflictDetail = CoordinatorPolicyDetail & {
  policyId: string
}
```

The admission bridge only surfaces details whose type starts with `evidence_conflict:`. Other policy metadata can remain internal unless a future phase gives it a clear consumer.

## Safety boundaries

- No model calls.
- No network calls.
- No database access.
- No user-owned object access.
- No repair execution.
- No live stream behavior changes.
- No source retrieval behavior changes.

## Regression coverage

Tests cover:

- clean admission returning an empty `conflictDetails` array;
- weak-source repair admission still returning no conflict details;
- structured evidence conflicts surfacing through admission metadata with policy ID, conflict ID, conflict type, severity, evidence IDs, claim IDs, and reason.

## Follow-up

- Convert admission conflict details into targeted retrieval repair hints.
- Add debug/UI consumers that can show disagreement metadata without exposing unrelated user state.
- Keep live chat wiring separate until repair/admission behavior is fully covered by deterministic tests.
