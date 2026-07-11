# Phase AI-I3D: Live Coordinator Handoff

## Status

In progress.

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

When the Router requires entity grounding, the Coordinator handoff must preserve the mandatory grounding requirement. Wikidata and DBpedia may later supply identity and relationship candidates, but they must not override fresher primary evidence and their absence or disagreement must remain visible to Coordinator policy.
