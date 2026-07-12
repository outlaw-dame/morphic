# Phase AI-I5 — Fusion Planning and Bounded Retrieval Execution

## Status

Implementation complete and integrated into the governed production runtime boundary in PR #106. Production rollout remains disabled and is governed by later rollout phases.

## Purpose

AI-I5 provides one authoritative plan-to-execution boundary for governed research. The Fusion Planner creates immutable, bounded retrieval lanes. The production Fusion retrieval executor consumes only those validated lanes and returns normalized results plus a bounded execution report to the Coordinator.

## Preserved and reconciled work

The useful planner concepts from closed PR #99 were re-evaluated against the canonical V2 contracts and recreated from current `main`. The stale branch, reused AI-I3 label, and temporary workflow modifications from that branch were not carried forward.

The pre-existing ordinary search executor remains available only for routes that do not require Fusion. Its inaccurate completion metadata was corrected: ordinary search reports only `router` and `retriever`, never `fusion_planner`, `source_quality`, or `entity_grounding` unless those stages actually execute.

## Implemented planner boundary

- Runs `fusion_planner` through the common hardened role runner.
- Uses `retrieval_plan_only` permission with no executable tools or raw search results.
- Binds the plan to the immutable Router route digest and one execution identity.
- Uses canonical source classes and structured path purposes.
- Validates bounded path IDs, path queries, source classes, result counts, reason codes, and schema versions.
- Rejects duplicate path IDs and normalized duplicate queries.
- Rejects disallowed source classes and omitted required source classes.
- Requires explicit freshness and entity-disambiguation paths when the Router requires them.
- Enforces route-specific minimum source diversity.
- Caps community-source influence to one bounded lane with at most five results.
- Enforces aggregate result and route tool-call budgets before execution.
- Does not retry model planning.
- Treats OpenRouter or any other eligible model provider through the same structured role-provider contract; no provider-specific Fusion server tool can bypass canonical validation.

## Implemented execution boundary

- Consumes only the validated Fusion plan.
- Runs approved lanes with bounded concurrency.
- Applies a per-path timeout and route-wide pre-call tool-budget tokens.
- Prevents new calls or retries after the route budget is exhausted.
- Retries only idempotent transient reads.
- Uses capped exponential backoff with jitter and bounded `Retry-After` support.
- Treats HTTP 408, 429, 5xx, `TimeoutError`, `ETIMEDOUT`, `ECONNRESET`, and `EAI_AGAIN` as transient when caller cancellation is not active.
- Does not retry deterministic 4xx, malformed responses, policy failures, invalid requests, or planner failures.
- Propagates caller cancellation and prevents later lanes from starting.
- Keeps retrieval behind the existing production safe-search port and its SSRF, redirect, DNS, domain, response-size, and network controls.
- Canonicalizes HTTP(S) URLs, strips credentials and fragments, normalizes default ports, and sorts query parameters.
- Bounds, freezes, and deduplicates returned results.
- Attaches route digest, path ID, path purpose, source class, and retrieval time to every returned result.
- Returns immutable path outcomes and budget consumption metadata.
- Allows bounded optional-path failure but fails closed for required source, freshness, or entity lanes.
- Rejects all-empty Fusion retrieval.

## Runtime integration

`createProductionGovernedRuntime` accepts either:

- a prebuilt ordinary retrieval executor; or
- a Fusion configuration containing the planner model configuration, safe search port, concurrency, timeout, retry timing, clock, and randomness controls.

A signed route with `needsFusionPlanning=true` cannot use an ordinary retrieval executor. Runtime construction rejects malformed planner, provider, candidate, search-port, timeout, concurrency, sleep, clock, or randomness configuration before execution.

The governed pipeline preserves the canonical Coordinator lifecycle, retrieval-attempt accounting, repair-action filtering, composition approval, and cancellation behavior while carrying the optional Fusion execution report through the retrieval adapter.

## Truthful completion accounting

Ordinary retrieval reports:

- `router`
- `retriever`

Successful Fusion retrieval reports:

- `router`
- `fusion_planner`
- `retriever`

AI-I5 never claims `source_quality` or `entity_grounding` completed. Those remain separate canonical stages.

## Security boundaries

- Planner output cannot select arbitrary network destinations.
- Provider-specific tools cannot bypass the safe search port.
- Disallowed source classes cannot be re-enabled by model output.
- No path can exceed its own result cap or the route-wide call/result budget.
- Retry cannot exceed the route budget.
- Duplicate lanes, stale/forged route contexts, malformed output, invalid URLs, unsupported source classes, and missing mandatory lanes fail closed.
- Planner and retrieval output do not authorize composition or release.
- No rollout flag or production traffic is enabled by this phase.

## Validation evidence

Planner tests cover:

- permission isolation and immutable structured output;
- route authorization;
- duplicate semantic queries;
- disallowed classes;
- required freshness/entity lanes;
- source diversity;
- community influence caps;
- cancellation without planner retry;
- provider-agnostic structured normalization.

Executor tests cover:

- approved-lane execution;
- bounded concurrency;
- URL canonicalization and deduplication;
- provenance preservation;
- aggregate result and pre-call tool budgets;
- bounded `Retry-After`, exponential retry, and transient timeout retry;
- deterministic failure no-retry behavior;
- optional partial failure;
- mandatory-lane fail-closed behavior;
- cancellation preventing later work;
- real per-path timeout termination.

Runtime and adapter tests cover:

- Fusion-required route fail-closed behavior;
- malformed Fusion configuration rejection;
- completion-report validation;
- hostile/malformed result rejection;
- ordinary-search completion accuracy.

Final completion requires the clean PR head, after removal of temporary diagnostic workflow steps, to pass type checking, format checking, lint, tests, native configuration verification, and the production build.