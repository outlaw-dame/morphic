# Phase AI-I3D: Live Coordinator Handoff

## Status

State-boundary implementation in progress. Streaming separation and production enforcement remain incomplete.

## Objective

Connect the verified Router execution context to a real Coordinator evaluation boundary without fabricating evidence state or weakening existing deterministic policies.

## Implemented in this slice

- `CoordinatorExecutionState` now supports explicit enforcement stages:
  - `post_retrieval_pre_composition`;
  - `post_composition_pre_release`.
- Completed roles are parsed through the canonical model-role schema.
- A stage-aware role-completion policy blocks when roles required at the current boundary are missing.
- `evaluateLiveCoordinatorHandoff()`:
  - re-verifies the canonical route and SHA-256 digest;
  - bounds query and evidence-batch sizes;
  - rejects invalid clocks and retrieval timestamps;
  - builds the evidence graph only from actual search results;
  - evaluates source mix, entity grounding, freshness, contradictions, role completion, escalation, and repair;
  - returns a blocking or repair decision rather than optimistic defaults.

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

The live handoff never infers that a role completed merely because the Router requested it. It also does not treat ordinary search results as successful entity grounding when no resolved entities are attached.

## Entity routing

When the Router requires entity grounding, the Coordinator handoff preserves the mandatory grounding requirement. Wikidata and DBpedia may later supply identity and relationship candidates, but they must not override fresher primary evidence and their absence or disagreement must remain visible to Coordinator policy.

## Remaining integration work

The current production `ToolLoopAgent` retrieves evidence and composes the answer in one stream. A post-finish Coordinator check would occur too late, and an empty-state precheck would block every research request. The governed path must therefore be separated into retrieval completion, Coordinator evaluation/repair, and composition before AI-I3D can be marked complete.

No production streaming claim is made by this slice.
