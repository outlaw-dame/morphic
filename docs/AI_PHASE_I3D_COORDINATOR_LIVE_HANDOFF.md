# Phase AI-I3D: Live Coordinator Handoff

## Status

State-boundary implementation complete. Production streaming separation remains the next slice.

## Objective

Connect the verified Router execution context to a real Coordinator evaluation boundary without fabricating evidence state or weakening existing deterministic policies.

## Required inputs

Before composition can be governed, the live path must provide schema-valid values for:

- canonical route plan and digest;
- normalized evidence items and source classes;
- entity-grounding status and ambiguity;
- freshness requirements and evidence timestamps;
- contradiction state;
- completed role executions;
- repair and escalation state.

## Safety invariant

The Coordinator may permit composition only from real execution state. Missing required evidence, grounding, freshness, or verification inputs must produce a blocking or repair decision rather than optimistic defaults.

## Entity routing

When the Router requires entity grounding, the Coordinator handoff preserves the mandatory grounding requirement. Wikidata and DBpedia may later supply identity and relationship candidates, but they must not override fresher primary evidence and their absence or disagreement remains visible to Coordinator policy.

## Implemented boundary

This slice adds:

- explicit post-retrieval/pre-composition and post-composition/pre-release stages;
- stage-aware required-role enforcement;
- canonical route-context re-verification;
- bounded query and evidence-batch validation;
- evidence-graph construction from actual search results only;
- deterministic source-mix, entity-grounding, freshness, contradiction, escalation, and repair evaluation;
- fail-closed handling for malformed queries, missing route contexts, invalid timestamps, missing roles, forged digests, and oversized result batches.

## Remaining integration

The current production `ToolLoopAgent` still combines retrieval and answer composition in one stream. The next slice must separate retrieval completion, Coordinator evaluation and bounded repair, and answer composition before production pre-composition enforcement can be claimed.
