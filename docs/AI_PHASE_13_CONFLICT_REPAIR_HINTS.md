# Phase AI-13 Conflict Repair Hints

## Purpose

Phase AI-13 converts structured admission conflict details into deterministic repair hints.

Phase AI-12 exposed conflict details through the Coordinator admission bridge. That made disagreement metadata visible to callers, but it did not provide a stable repair-oriented summary. This phase adds metadata that later retrieval or UI layers can consume without parsing raw conflict reasons or policy details.

## What changed

`CoordinatorAdmission` now includes:

```ts
conflictRepairHints: CoordinatorAdmissionConflictRepairHint[]
```

Each repair hint includes:

- a stable hint ID;
- the producing policy ID;
- the conflict ID when available;
- a deterministic repair action;
- a high/medium priority derived from conflict severity;
- de-duplicated evidence IDs and claim IDs;
- a human-readable reason for the repair direction.

Conflict types map to repair actions as follows:

| Conflict detail type | Repair action |
| --- | --- |
| `evidence_conflict:numeric_mismatch` | `retrieve_primary_numeric_source` |
| `evidence_conflict:status_mismatch` | `retrieve_current_status_source` |
| Other `evidence_conflict:*` types | `retrieve_independent_corroboration` |

Block-level conflicts become high-priority repair hints. Warning-level conflicts become medium-priority repair hints.

## Safety boundaries

- No repair execution.
- No model calls.
- No retrieval calls.
- No network calls.
- No database access.
- No user-owned object access.
- No live stream behavior changes.

## Defensive behavior

The repair hint builder is intentionally deterministic and side-effect free. It does not trust optional runtime metadata blindly:

- missing, blank, or non-string conflict IDs receive stable fallback IDs based on list order;
- returned `conflictId` values are only populated when the source ID is a non-empty string;
- non-array evidence/claim ID fields are treated as empty lists;
- evidence IDs and claim IDs are de-duplicated;
- only string evidence/claim IDs are retained.

## Regression coverage

Tests cover:

- clean admissions returning no conflict details or hints;
- unrelated weak-source repair admissions returning no conflict hints;
- structured conflict details surfacing alongside a high-priority corroboration hint;
- numeric conflicts mapping to primary numeric-source retrieval hints;
- status conflicts mapping to current status-source retrieval hints;
- duplicate evidence/claim IDs being removed;
- missing or blank conflict IDs using stable fallback hint IDs;
- malformed runtime IDs and non-array evidence/claim fields being ignored safely.

## Follow-up

- Feed these hints into a bounded, audited repair planner.
- Add route-aware constraints for which repair actions are allowed for each route risk level.
- Keep live retrieval execution separate until repair planning has dedicated tests, retry limits, and telemetry-safe audit output.
