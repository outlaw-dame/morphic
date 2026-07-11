# Phase AI-I3G: Evidence-Only Composition Adapter

## Status

Implemented on a dedicated branch from verified AI-I3F merge `244c35745fe7bea92be1370310be9b27164b2da7`. Production chat and streaming remain on the existing path until later release gates, shadow validation, CI, and review are complete.

## Objective

Create the production-facing composition boundary for the governed two-stage research pipeline. The adapter may compose only from the immutable Router context and the exact evidence graph explicitly approved by the deterministic Coordinator.

## Implemented execution order

1. Revalidate the immutable Router execution context and digest.
2. Require an unforgeable Coordinator approval capability bound to both the route digest and exact evidence-graph instance.
3. Validate and project the approved evidence graph into a bounded evidence-only model input.
4. Validate the completed-role set and reject any claim that `answer_composer` is already complete.
5. Bind the Composer invocation to the canonical execution scope and AI-I1 `answer_composer` role profile.
6. Invoke through the AI-I2 hardened role runner with permission class `none`.
7. Validate structured draft output and reject citations outside the approved evidence IDs.
8. Return an immutable draft marked `pending_advisor_and_citation_verifier`.

## Safety invariants

- Raw search results and unapproved evidence never enter the Composer input.
- Pipeline call order alone is not treated as authorization; composition requires a branded Coordinator approval.
- Approval is invalid if copied, structurally forged, used with a different route digest, or used with a different evidence-graph object.
- The Composer cannot declare retrieval, grounding, source-quality, Advisor, citation-verification, or its own role complete.
- Composition cannot weaken Router or Coordinator requirements.
- No retrieval, browsing, entity-provider, database, filesystem, or mutation tool permission is granted.
- Input and output sizes, output tokens, deadlines, cancellation, candidate selection, provider envelopes, and structured output are enforced by the hardened role runner.
- Automatic retries are disabled for composition.
- Model citations are deduplicated and must reference admitted evidence IDs.
- Output is not releasable to the user until later post-composition gates explicitly approve it.

## Test coverage

- successful composition receives only Coordinator-approved evidence;
- provider invocation uses canonical role `answer_composer` and permission class `none`;
- forged Coordinator approval is rejected before provider access;
- citations outside the evidence graph are rejected;
- cancellation before composition prevents provider access;
- malformed model output is rejected through the hardened role runner;
- successful output remains pending Advisor and Citation Verifier review.

## Explicit non-goals

This phase does not:

- wire the governed pipeline into production streaming;
- execute Wikidata or DBpedia entity grounding;
- implement Advisor or Citation Verifier release approval;
- claim that composed output is safe for user release;
- replace the deterministic Coordinator or Router authority.

## Follow-on phase

AI-I3H should implement the evidence-and-draft-only Advisor boundary, followed by the Citation Verifier and final deterministic release decision. Production-path replacement remains gated by those phases, evaluations, tracing, shadow rollout, and rollback controls.
