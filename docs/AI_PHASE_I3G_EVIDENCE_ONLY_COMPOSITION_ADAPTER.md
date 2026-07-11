# Phase AI-I3G: Evidence-Only Composition Adapter

## Status

In progress on a dedicated branch from the verified AI-I3F merge. Production chat and streaming remain on the existing path until this adapter, release gates, shadow validation, CI, and review are complete.

## Objective

Create the production-facing composition boundary for the governed two-stage research pipeline. The adapter may compose only from the immutable Router context and the evidence graph explicitly approved by the deterministic Coordinator.

## Required execution order

1. Revalidate the immutable Router execution context and digest.
2. Verify that the Coordinator handoff permits composition.
3. Validate and recursively freeze the approved evidence graph and completed-role set.
4. Bind the Composer invocation to the canonical execution scope and AI-I1 role profile.
5. Invoke the Composer through the AI-I2 hardened role runner.
6. Grant no retrieval, browsing, entity-provider, database, filesystem, or mutation tools.
7. Validate the structured Composer output and enforce route-bound token and output limits.
8. Return a composition result that remains subject to Advisor and Citation Verifier release gates.

## Safety invariants

- Raw search results, request prose, and unapproved evidence may not enter the Composer input.
- The Composer cannot declare retrieval, grounding, source-quality, Advisor, or citation-verification roles complete.
- Composition cannot weaken Router or Coordinator requirements.
- No model-proposed tool call is executable at this boundary.
- Missing, malformed, accessor-backed, cyclic, oversized, or tampered inputs fail closed before model invocation.
- Cancellation is checked before and after the model side effect.
- Automatic retries remain disabled unless the role runner proves the operation is tool-free, idempotent, transiently failed, and within the immutable deadline and attempt budget.
- Output is not releasable to the user until later post-composition gates explicitly approve it.

## Required tests

- refuses a tampered route or digest;
- refuses composition when the Coordinator has not approved the handoff;
- proves the model receives only approved evidence;
- proves no tools or mutable permissions are exposed;
- rejects malformed and oversized evidence graphs before invocation;
- rejects arbitrary completed roles;
- propagates cancellation before and after invocation;
- rejects malformed, accessor-backed, or oversized model output;
- proves a successful composition is still marked pending release review;
- proves caller-owned input objects and arrays are not mutated.

## Explicit non-goals

This phase does not:

- wire the governed pipeline into production streaming;
- execute Wikidata or DBpedia entity grounding;
- implement Advisor or Citation Verifier release approval;
- claim that composed output is safe for user release;
- replace the deterministic Coordinator or Router authority.
