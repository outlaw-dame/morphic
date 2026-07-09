# Phase AI-14 Bounded Repair Planner

## Purpose

Phase AI-14 adds a deterministic repair planner for Coordinator admissions.

Phase AI-13 produced conflict repair hints but intentionally did not execute retrieval, model calls, or repair work. This phase turns admission-level repair actions and conflict hints into a bounded list of repair steps that later execution layers can consume safely.

## What changed

A new pure planner lives at:

```ts
lib/agents/coordinator/repair-planner.ts
```

It exports:

```ts
createBoundedRepairPlan(input): CoordinatorBoundedRepairPlan
```

The planner accepts:

- the route plan;
- required repair actions from admission;
- conflict repair hints from admission;
- current retrieval attempt count;
- maximum retrieval attempts;
- maximum number of repair steps.

It returns:

- whether any repair can be attempted;
- remaining retrieval attempts;
- ordered repair steps;
- skipped actions with reasons;
- blocked reasons when no supported step can be produced.

## Safety boundaries

This phase is metadata-only and side-effect free:

- No retrieval execution.
- No model calls.
- No network calls.
- No database access.
- No user-owned object access.
- No live stream behavior changes.
- No mutation of admission, evidence graph, or route state.

## Planner behavior

The planner:

- prioritizes high-priority conflict hints before medium and low-priority policy actions;
- de-duplicates normalized repair actions;
- skips unsupported repair actions;
- enforces a maximum number of repair steps;
- enforces a retrieval-attempt budget for retrieval actions;
- decrements remaining retrieval budget for each planned retrieval step;
- blocks later retrieval steps once the remaining retrieval budget reaches zero;
- reports skipped actions instead of throwing;
- clamps invalid numeric limits to safe non-negative values.

## Defensive behavior

The planner treats admission metadata as runtime input and avoids trusting optional fields blindly:

- missing route plans are treated as non-high-assurance routes instead of throwing;
- missing action arrays and hint arrays default to empty arrays;
- non-string and blank repair actions are ignored;
- non-array evidence/claim ID fields become empty arrays;
- evidence/claim IDs are string-filtered and de-duplicated;
- invalid hint priorities fall back to low priority;
- blank or non-string reasons fall back to deterministic action reasons.

## Route-aware constraints

High-risk, critical-risk, and critical-mode routes avoid broad retrieval instructions when possible. Critical mode is treated as high assurance even when the router-inferred risk level is lower.

| Broad action | High-assurance normalized action |
| --- | --- |
| `retrieve_more_sources` | `retrieve_authoritative_sources` |
| `retrieve_independent_sources` | `retrieve_independent_corroboration` |

The original action is retained on the repair step as `originalAction` so audit/debug layers can see what was normalized.

## Supported repair actions

The planner only emits supported deterministic repair actions:

- `retrieve_authoritative_sources`
- `retrieve_current_status_source`
- `retrieve_disambiguating_sources`
- `retrieve_fresh_sources`
- `retrieve_independent_corroboration`
- `retrieve_independent_sources`
- `retrieve_more_sources`
- `retrieve_primary_numeric_source`
- `retrieve_required_source_classes`
- `run_advisor_review`
- `run_citation_verifier`
- `run_contradiction_review`
- `run_entity_grounding`
- `select_stronger_model`

Unknown actions are skipped with `unsupported_repair_action`.

## Regression coverage

Tests cover:

- empty/no-op plans;
- conflict hints taking priority over lower-priority policy actions;
- action de-duplication;
- retrieval-attempt budget exhaustion;
- retrieval budget decrementing per planned retrieval step;
- blocking subsequent retrieval steps once the budget is exhausted;
- high-risk broad-action normalization;
- critical-mode broad-action normalization even when inferred risk is low;
- unsupported actions;
- maximum step limits;
- invalid numeric bounds;
- malformed runtime arrays and missing route metadata.

## Follow-up

- Wire this planner into the Coordinator admission layer as optional metadata.
- Add an audited repair executor that consumes planner steps with strict retry limits and telemetry-safe logs.
- Keep live chat/search execution separate until repair execution has dedicated integration tests.
