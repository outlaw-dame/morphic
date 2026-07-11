# Phase AI-I3E: Two-Stage Coordinator Pipeline

## Status

In progress on a dedicated branch. Production chat wiring remains disabled until the pipeline contract, adapters, tests, CI, and review are complete.

## Objective

Separate retrieval from answer composition so the deterministic Coordinator can evaluate real evidence and bounded repairs before any answer model is allowed to compose a response.

## Enforced order

1. Verify the immutable Router execution context.
2. Run a bounded retrieval adapter.
3. Record an audited retrieval timestamp and completed roles.
4. Build the normalized evidence graph.
5. Run deterministic Coordinator policies.
6. Execute only allowlisted, bounded pre-composition repairs when necessary.
7. Invoke the composition adapter only after `canProceedToComposition` is true.
8. Preserve cancellation and fail closed on invalid adapters, limits, timestamps, routes, evidence, roles, or repair actions.

## Safety rules

- The composition adapter cannot run before Coordinator approval.
- Retrieval attempts are bounded to one through five; the default is two.
- Repair actions are deduplicated, length-bounded, count-bounded, and allowlisted.
- Freshness-sensitive routes require an explicit audited retrieval timestamp.
- Missing entity grounding, source classes, required roles, freshness, or adequate evidence blocks composition.
- Cancellation is checked before retrieval, after retrieval, before composition, and after composition.
- The pipeline does not infer role completion or fabricate grounding.
- Production streaming remains on the existing path until concrete adapters are implemented and validated.

## Current implementation

`runGovernedResearchPipeline()` provides dependency-injected retrieval and composition boundaries. It evaluates every retrieval result through `evaluateLiveCoordinatorHandoff()` and exposes only the approved evidence graph to composition.

## Remaining work

- implement the production retrieval adapter without allowing answer composition;
- implement the evidence-only composition adapter through the hardened role runner;
- bind tool budgets and per-role permissions to the immutable route;
- connect bounded entity grounding, including Wikidata and DBpedia provider state;
- add post-composition Advisor and citation-verification release gates;
- integrate the pipeline into authenticated and guest streaming only after shadow and regression validation.
