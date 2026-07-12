# Phase AI-I5 — Fusion Planning and Bounded Retrieval Execution

## Status

In progress on a clean branch created from `main` after PR #105.

## Purpose

Implement one authoritative plan-to-execution boundary for governed research. The Fusion Planner creates immutable, bounded retrieval lanes. The production retrieval executor consumes only those approved lanes and reports only roles and work that actually completed.

## Preserved work

The hardened Fusion Planner design from closed PR #99 remains useful and will be re-evaluated against current contracts. The stale branch and its temporary CI diagnostic change are not being reused.

## Required implementation

1. Run the Fusion Planner through the common hardened role runner with `retrieval_plan_only` permission and no executable tools.
2. Bind every plan to the immutable Router route digest and one execution identity.
3. Validate bounded path IDs, queries, source classes, evidence roles, result counts, freshness requirements, and mandatory entity-disambiguation lanes.
4. Make the production search executor consume the validated paths rather than synthesizing one broad search from the user query.
5. Enforce bounded concurrency and a total result/tool-call budget across all paths.
6. Preserve cancellation and deadlines across planning and every retrieval lane.
7. Allow retry only for explicitly transient, idempotent retrieval failures and never for planner execution or unsafe failures.
8. Normalize and deduplicate all retrieved results before returning them to the Coordinator.
9. Preserve path-level provenance and partial-failure information for later evidence ingestion and observability phases.
10. Report `fusion_planner`, `retriever`, `source_quality`, and `entity_grounding` as completed only when the corresponding role or deterministic governed boundary actually ran successfully.

## Existing defect to remove

The current `production-search-retrieval-executor.ts` performs one broad search and currently reports `source_quality` plus conditional `entity_grounding` as completed even though it does not execute those roles. AI-I5 must remove that overclaim. Until later phases supply those roles, the executor may report only the Router, Fusion Planner, and Retriever work that verifiably completed.

## Security boundaries

- Planner output never directly selects arbitrary network destinations.
- Search remains behind the existing safe search port and SSRF controls.
- Disallowed source classes cannot be upgraded by model output.
- No lane may exceed its own result limit or the route-wide budget.
- Duplicate lane IDs, duplicate normalized queries, malformed outputs, stale route digests, and unsupported source classes fail closed.
- Planner and retrieval output are not composition approval or release authorization.
- No production rollout flag is enabled by this phase.

## Validation

The phase is not complete until tests prove:

- stale or forged route bindings are rejected;
- required source, freshness, and entity lanes cannot be omitted;
- duplicate and disallowed lanes are rejected;
- concurrency and aggregate budgets cannot be exceeded;
- cancellation stops pending work without starting new lanes;
- partial failures are deterministic and bounded;
- returned completion metadata never claims unexecuted roles;
- all repository CI and the production build pass.
