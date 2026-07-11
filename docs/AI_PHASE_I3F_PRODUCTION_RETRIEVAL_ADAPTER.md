# Phase AI-I3F: Production Retrieval Adapter

## Status

In progress on a dedicated branch from merged AI-I3E commit `7f1244cf9b7823210be712e1cb7157c6aed27cc7`.

## Objective

Provide the first production-facing retrieval boundary for the governed two-stage Coordinator pipeline without granting that boundary any answer-composition capability.

## Contract

The adapter must:

1. revalidate the immutable Router execution context and digest before retrieval;
2. trim and validate the query;
3. enforce the governed attempt range of one through five;
4. validate and freeze repair actions before handing them to retrieval;
5. check cancellation before and after the retrieval side effect;
6. reject null, malformed, oversized, or invalid retrieval output;
7. return immutable search results and completed-role metadata;
8. normalize the audited retrieval timestamp;
9. expose no composition model, answer prompt, or release path.

## Initial limits

- maximum search results per retrieval attempt: 500;
- maximum completed roles: 32;
- maximum repair actions: 32;
- maximum repair-action length: 128 characters.

These limits are defense-in-depth caps. Route-specific tool budgets remain authoritative and will be bound in the next integration slice.

## Safety boundary

This slice does not wire production chat or streaming. The injected executor is retrieval-only, and all returned evidence must still pass the deterministic Coordinator in `runGovernedResearchPipeline()` before composition can occur.

## Follow-on work

- connect the adapter to the concrete search/retrieval execution path;
- enforce route-specific tool-call and provider budgets;
- attach bounded Wikidata/DBpedia entity-grounding provider state where required;
- add shadow-mode comparison against the existing streaming path;
- implement the evidence-only composition adapter and post-composition release gates.
