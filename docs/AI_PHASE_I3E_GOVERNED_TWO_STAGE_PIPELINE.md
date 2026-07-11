# Phase AI-I3E: Governed Two-Stage Research Pipeline

## Status

Provider-independent orchestration contract complete. Production chat adapter wiring remains the next slice.

## Objective

Separate retrieval from answer composition so deterministic Coordinator policy can evaluate actual evidence before composition and again before release.

## Pipeline

1. Verify cancellation and bounded retrieval-attempt policy.
2. Invoke the read-only retrieval adapter.
3. Build the evidence graph from actual returned search results.
4. Run the post-retrieval/pre-composition Coordinator gate.
5. Pass retrieval-repairable blocking conditions or quality warnings into a bounded retrieval retry while attempt budget remains.
6. Invoke the composition adapter only after Coordinator approval.
7. Run the post-composition/pre-release Coordinator gate using the same evidence graph, anchored clock, and actual completed-role set.
8. Return composed output only when the release gate passes.

## Safety properties

- Composition is never called while pre-composition policy blocks.
- Candidate output is not included in blocked pre-release results.
- Logical evidence repair is bounded to at most three retrieval attempts.
- Composition is never automatically retried.
- Cancellation is checked before and after every asynchronous stage and propagated to both adapters.
- The pipeline never marks roles complete on behalf of an adapter.
- Entity grounding, source quality, Fusion, Advisor, and citation verification remain explicit completed-role requirements derived from the canonical route.
- Unsupported or non-retrieval repair actions do not trigger blind retrieval loops.
- Retrieval-quality warnings are repaired while budget remains, but cannot create unbounded retries.
- The Router context is re-verified through the AI-I3D handoff before evidence evaluation.
- Retrieval and composition adapter results are checked as own plain data properties before array access or spreading; accessor-backed, class-instance, missing-array, and null-role payloads fail closed.
- Both Coordinator gates use one anchored timestamp to prevent temporal drift within a request.

## Scope boundary

This slice provides the provider-independent orchestration contract and deterministic gates. It does not yet replace the current production `ToolLoopAgent` stream. Live chat wiring requires concrete retrieval and composition adapters that preserve streaming metadata, persistence, cancellation, provider headers, personalization, and tool authorization without reintroducing a combined retrieve-and-compose loop.
