# Phase AI-15 Admission Bounded Repair Plan

## Purpose

Phase AI-15 wires the bounded repair planner into Coordinator admission metadata.

Phase AI-14 introduced a pure planner that turns admission repair actions and conflict repair hints into capped, route-aware repair steps. This phase exposes that planner output directly on `CoordinatorAdmission` so callers can inspect the next safe repair direction without re-running planner logic or parsing lower-level policy results.

## What changed

`CoordinatorAdmission` now includes:

```ts
boundedRepairPlan: CoordinatorBoundedRepairPlan
```

For repair-status admissions, the admission bridge builds this field from:

- `routePlan` from the admission input;
- de-duplicated `requiredRepairActions` from the Coordinator repair plan;
- `conflictRepairHints` derived from structured evidence conflicts;
- `retrievalAttempts` and `maxRetrievalAttempts` from the admission input.

For compose-ready admissions, `boundedRepairPlan` is intentionally no-op even when other advisory metadata, such as citation-verifier model roles, is present. This keeps repair planning separate from composition-time verification.

When an admission is blocked, bounded repair planning prioritizes the policies that are actually holding composition. Warning-level conflict hints and warning-only policy repair actions remain visible in admission metadata, but they are not allowed to crowd out blocking repair actions in the capped bounded plan. Escalation safety actions from the Coordinator repair plan are preserved.

The existing `repairPlan` field from `CoordinatorEvaluation` remains unchanged. `boundedRepairPlan` is a separate admission-level view for safe repair planning metadata.

## Safety boundaries

This phase is still metadata-only:

- No repair execution.
- No retrieval calls.
- No model calls.
- No network calls.
- No database access.
- No user-owned object access.
- No live stream behavior changes.

## Behavior

Admission now exposes a bounded repair plan for both compose and repair statuses:

- compose-ready admissions return a no-op bounded plan with no steps;
- repair admissions return ordered, capped repair steps when supported deterministic actions are available;
- blocker repair actions are planned ahead of warning-only conflict hints/actions;
- retrieval repair steps respect the current retrieval attempt budget;
- block-severity conflict repair hints can become repair steps before lower-priority policy actions;
- non-retrieval review/model/citation steps can still be planned when retrieval budget is exhausted;
- unsupported legacy repair actions remain visible in `skippedActions` instead of throwing.

## Regression coverage

Tests cover:

- compose admissions returning a no-op bounded plan;
- weak-source repair admissions exposing bounded source/advisor/model/citation repair steps and skipped unsupported legacy actions;
- structured block conflict admissions exposing conflict hints and bounded repair steps;
- blocking freshness repairs staying in the bounded plan when warning-level conflict hints are also present;
- exhausted retrieval budgets skipping retrieval hints while retaining non-retrieval contradiction/model/citation review;
- existing malformed runtime conflict-detail and repair-hint hardening.

## Follow-up

- Add an audited repair executor that consumes `boundedRepairPlan.steps` with strict retry limits.
- Keep executor integration separate from live chat/search until it has dedicated integration tests and telemetry-safe audit output.
- Add UI/debug consumers that display bounded repair plan metadata without exposing unrelated user state.
