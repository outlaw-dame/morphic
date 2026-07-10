# Phase AI-17 Admission Executor Metadata

## Purpose

Phase AI-17 exposes audited repair executor metadata through the Coordinator admission bridge.

Phase AI-15 added bounded repair plans to admission. Phase AI-16 added a pure audited repair executor planner, but callers still had to invoke it separately. This phase wires the pure planner into admission so callers can inspect the bounded repair steps and the corresponding audit records from one deterministic admission object.

This is still metadata only. It is not a live repair runner.

## What changed

`CoordinatorAdmission` now includes:

```ts
repairExecutorPlan: CoordinatorRepairExecutorPlan
```

The value is built from the admission's `boundedRepairPlan` using:

```ts
createAuditedRepairExecutorPlan({ plan: boundedRepairPlan })
```

The executor plan includes:

- `canExecute` for whether any supported repair step is queued;
- sanitized retry policy metadata;
- one audit record per bounded repair step;
- blocked reasons when no supported step can be queued.

## Safety boundaries

This phase does not execute repairs. It does not perform or schedule any side effects:

- No retrieval calls.
- No model calls.
- No network calls.
- No timers or background work.
- No database access.
- No user-owned object access.
- No live stream behavior changes.

## Defensive behavior

The admission bridge only passes its internally generated bounded repair plan into the audited executor planner. The executor planner remains responsible for sanitizing:

- runtime step metadata;
- supported actions;
- retry policy bounds;
- completed step ids;
- prior attempts;
- evidence ids;
- claim ids.

## Regression coverage

Tests cover:

- compose admissions exposing a blocked no-op executor plan;
- repair admissions exposing queued audit records matching bounded repair steps;
- conflict-hint evidence and claim ids flowing into audit metadata;
- retrieval-budget exhaustion preventing retrieval repair records from being queued while non-retrieval review records remain available.

## Follow-up

- Add explicit caller-supplied executor state only after there is a clear consumer for completed step ids and prior attempt counts.
- Keep live repair execution separate until integration tests define source-access, retry, timeout, audit logging, and privacy boundaries.
- Add UI/debug consumers that can display executor records without exposing unrelated user state.
