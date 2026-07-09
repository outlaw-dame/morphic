# Phase AI-16 Audited Repair Executor

## Purpose

Phase AI-16 adds a deterministic audited repair executor plan for Coordinator repair metadata.

Phase AI-15 exposed `boundedRepairPlan` on Coordinator admission so callers can inspect safe repair steps without parsing raw policy output. This phase adds a pure executor-planning layer that consumes those bounded steps and produces audit records, bounded attempt counts, and deterministic retry-delay metadata.

This is not a live repair runner. It does not execute retrieval, model calls, network requests, database writes, or user-owned object access.

## What changed

A new pure module was added:

```ts
createAuditedRepairExecutorPlan(input): CoordinatorRepairExecutorPlan
```

The executor plan accepts:

- a `CoordinatorBoundedRepairPlan`;
- optional completed step ids;
- optional prior attempt counts by step id;
- optional retry policy overrides.

It returns:

- `canExecute`, true only when at least one repair step is queued;
- a sanitized retry policy;
- one audit record per step;
- blocked reasons when no supported step is executable.

## Retry policy

The retry policy is deterministic and bounded:

- default max attempts per step: `2`;
- hard cap on max attempts per step: `5`;
- default base delay: `1000ms`;
- default max delay: `30000ms`;
- hard cap on max delay: `300000ms`.

Retry delay metadata uses deterministic exponential backoff. There is no random jitter and no timer scheduling in this phase.

## Safety boundaries

This phase is metadata-only:

- No repair execution.
- No retrieval calls.
- No model calls.
- No network calls.
- No database access.
- No user-owned object access.
- No live stream behavior changes.
- No background work or timers.

The executor does not trust runtime input. It sanitizes step ids, action names, completed step ids, prior attempt counts, evidence ids, and claim ids. Unsupported repair actions are skipped with explicit audit metadata instead of being executed or thrown.

## Behavior

The executor emits one record per step:

- `queued` when a supported step still has remaining attempts;
- `completed` when the caller marks the step id complete;
- `skipped` when the step is invalid, unsupported, or has exhausted its bounded attempts.

Completed steps are never queued again. Exhausted steps are never retried. Malformed runtime steps are skipped with `invalid_step`. Unsupported actions are skipped with `unsupported_repair_action`.

## Regression coverage

Tests cover:

- no-op repair plans returning blocked metadata;
- supported repair steps producing queued audit records;
- deterministic exponential retry delay metadata;
- exhausted attempts skipping instead of queuing;
- completed steps suppressing retries;
- malformed and unsupported runtime steps being skipped safely;
- adversarial retry policy inputs being clamped to deterministic safe bounds.

## Follow-up

- Add a real repair executor only after dedicated integration tests and telemetry-safe audit output are in place.
- Keep live chat/search integration separate until repair execution has explicit source-access, retry, timeout, and privacy boundaries.
- Add UI/debug consumers that can display executor audit records without exposing unrelated user state.
