# Phase AI-I7 — Entity Grounding V2 and Provider Routing

## Status

Implementation contract approved for merge after AI-I6 route-digest hardening. Runtime integration remains outstanding and must be completed in a separate implementation PR before AI-I7 can be marked complete.

## Purpose

Make entity grounding a governed, route-bound and non-bypassable stage for entity-sensitive research. Existing Wikidata and DBpedia clients and deterministic entity-resolution utilities are retained, but their orchestration must be replaced with bounded provider routing, explicit provenance, ambiguity enforcement and truthful Coordinator completion accounting.

## Existing implementation retained

- Entity mention extraction from the query and retrieved evidence.
- Wikidata and DBpedia lookup clients.
- Deterministic candidate merging and confidence scoring.
- Ambiguity detection for same-label canonical conflicts.
- Canonical entity identifiers and URLs when providers supply them.

These components are useful foundations, but the current helper calls both providers directly without a signed route binding, provider-result contracts, bounded retry policy, provider-level deadlines, immutable audit output or live Coordinator integration.

## Required implementation

1. Run the `entity_grounding` role through the common hardened role runner only when the signed Router requires it.
2. Bind every grounding operation to the exact Router digest and one execution identity.
3. Require both Wikidata and DBpedia provider attempts, recording either a successful response or a bounded failure class, for entity-sensitive routes unless cancellation or the route-wide deadline prevents a call from starting.
4. Normalize each provider response into the canonical `EntityProviderResult` contract with provider identity, mention identity, status, canonical IDs, result digest, retrieval time, reason codes and bounded failure class.
5. Apply per-provider deadlines, bounded concurrency and cancellation propagation.
6. Retry only transient idempotent provider reads, including transient HTTP 429 rate limits, with capped exponential backoff and jitter; never retry malformed responses, deterministic non-transient 4xx responses such as 400, 401, 403 or 404, policy failures or model execution.
7. Bound mention count, candidate count, response size, canonical identifiers and total provider calls using governed configuration limits rather than hardcoded constants.
8. Keep provider network access behind the existing safe-network and SSRF controls.
9. Preserve provider-level provenance through deterministic entity resolution and into the governed evidence/Coordinator state.
10. Treat unresolved or ambiguous required entities as a composition blocker with deterministic repair actions.
11. Report `entity_grounding` completed only after required provider attempts and deterministic validation succeed.
12. Never allow provider or model output to mark source quality, composition, verification or release complete.

## Attempt-accounting semantics

A provider attempt is considered accounted for when the governed adapter records one of:

- a validated successful provider response;
- a bounded and classified provider failure, such as timeout, transient network failure, transient 429 rate limit, deterministic non-transient 4xx response, malformed response or policy rejection;
- a deterministic `not_started` result caused by cancellation or exhaustion of the signed route-wide deadline before the call could begin.

A provider outage alone must not permanently block composition when the other required provider resolves the entity with sufficient deterministic evidence and the failed attempt is truthfully recorded. Unresolved or materially ambiguous required entities still block composition.

## Fail-closed conditions

Entity-sensitive research must not proceed to composition when:

- the route digest is missing, malformed, stale or forged;
- required provider attempts were skipped without cancellation/deadline justification;
- provider output is malformed or exceeds bounds;
- canonical identifiers conflict without an explicit ambiguity result;
- a required entity remains unresolved;
- ambiguity remains material to the requested claim;
- completion metadata claims grounding without a valid grounding report.

## Compatibility and migration

Historical entity helper APIs may remain for non-governed utility use, but the production governed runtime must use one canonical AI-I7 adapter. Existing provider clients should be wrapped rather than duplicated. Existing tests using direct helpers must not be represented as proof of governed integration.

## Validation requirements

The phase is not complete until tests prove:

- exact Router-digest and execution-scope binding;
- mandatory Wikidata and DBpedia attempt accounting, including bounded failures and justified `not_started` outcomes;
- cancellation prevents later provider work;
- transient-only retry, explicit 429 handling and bounded backoff;
- governed configuration limits replace hardcoded production bounds;
- malformed, oversized and hostile provider responses fail closed;
- same-label canonical conflicts remain explicitly ambiguous;
- unresolved required entities block composition;
- successful grounding is preserved into Coordinator state;
- truthful role-completion metadata;
- full repository CI and production build pass.
