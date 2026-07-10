# Phase AI-18 Admission Executor State

## Purpose

Phase AI-18 allows Coordinator admission callers to provide bounded repair executor state while preserving the Coordinator-owned repair plan.

Phase AI-17 exposed executor audit metadata through admission. This phase adds the minimum state required to represent prior progress and retry history across deterministic admission evaluations.

This remains metadata-only. It does not execute repairs or schedule work.

## API

`CoordinatorAdmissionInput` now accepts:

```ts
repairExecutorState?: CoordinatorAdmissionRepairExecutorState
```

The state type is derived from `CoordinatorRepairExecutorInput` with the `plan` field removed:

```ts
type CoordinatorAdmissionRepairExecutorState = Omit<
  CoordinatorRepairExecutorInput,
  'plan'
>
```

Callers may provide:

- completed repair-step ids;
- prior attempt counts by repair-step id;
- maximum attempts per step;
- base retry delay metadata;
- maximum retry delay metadata.

Callers cannot provide or replace the bounded repair plan through this state object.

## Deterministic behavior

Admission always creates its bounded repair plan internally. It then combines that plan with the caller-provided executor state and delegates sanitization to `createAuditedRepairExecutorPlan`.

This supports:

- marking previously completed steps without re-queuing them;
- carrying bounded prior-attempt counts forward;
- calculating deterministic exponential retry-delay metadata;
- clamping malformed or adversarial retry-policy values;
- ignoring malformed completed-step and prior-attempt containers.

## Safety boundaries

- No repair execution.
- No retrieval calls.
- No model calls.
- No network calls.
- No timers or background scheduling.
- No database access.
- No user-owned object access.
- No live stream behavior changes.

The executor state is untrusted runtime metadata. The existing audited executor planner remains the sanitation and bounds-enforcement boundary.

## Regression coverage

Tests cover:

- completed-step ids preventing duplicate queueing;
- normalized padded step ids matching stable bounded-plan ids;
- prior attempts producing deterministic exponential backoff metadata;
- retry-policy values being clamped to safe bounds;
- malformed completed-step and prior-attempt containers being ignored;
- an adversarial extra `plan` field being unable to replace the Coordinator-owned bounded plan.

## Follow-up

- Add a durable, privacy-safe audit-state persistence contract only after storage ownership and retention requirements are defined.
- Keep persistence separate from admission so the deterministic Coordinator layer remains storage-agnostic.
- Define explicit idempotency and concurrency rules before any live repair worker consumes executor records.
