# Phase AI-I3E: Governed Two-Stage Research Pipeline

## Status

Adapter-driven orchestration implemented. Production chat wiring remains pending validation and review.

## Objective

Separate retrieval from answer composition so deterministic Coordinator policy can evaluate actual evidence before composition and again before release.

## Pipeline

1. Verify cancellation and bounded retrieval-attempt policy.
2. Invoke the read-only retrieval adapter.
3. Build the evidence graph from actual returned search results.
4. Run the post-retrieval/pre-composition Coordinator gate.
5. If blocked by retrieval-repairable conditions, pass the exact repair actions into a bounded retrieval retry.
6. Invoke the composition adapter only after Coordinator approval.
7. Run the post-composition/pre-release Coordinator gate using the same evidence graph and actual completed-role set.
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
- The Router context is re-verified through the AI-I3D handoff before evidence evaluation.

## Scope boundary

This slice provides the provider-independent orchestration contract and deterministic gates. It does not yet replace the current production `ToolLoopAgent` stream. Live chat wiring requires concrete retrieval and composition adapters that preserve streaming metadata, persistence, cancellation, provider headers, personalization, and tool authorization without reintroducing a combined retrieve-and-compose loop.
