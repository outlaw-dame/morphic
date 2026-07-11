# Phase AI-I3H: Evidence-and-Draft-Only Advisor Review Adapter

## Status

In progress on a dedicated branch from verified AI-I3G merge `e6e7b761409aeec0ec80c44492580312f4fd9dd1`. Production chat and streaming remain unchanged.

## Objective

Create a production-facing Advisor boundary that reviews the exact Coordinator-approved evidence graph and the exact pending Composer draft. The Advisor may recommend approval, bounded repair, or blocking, but it cannot retrieve evidence, mutate evidence, rewrite the draft directly, or release output to the user.

## Required execution order

1. Revalidate the immutable Router execution context and digest.
2. Require the exact Coordinator composition approval and successful `answer_composer` execution result.
3. Bind the Advisor review to the approved evidence graph, Composer output digest, and canonical execution scope.
4. Project only bounded evidence, draft text, admitted citation IDs, warnings, conflicts, and route requirements into Advisor input.
5. Invoke canonical role `advisor` through the AI-I2 hardened role runner with permission class `none`.
6. Validate a strict structured decision: `approve`, `repair`, or `block`.
7. Allow only canonical bounded repair reason codes; model-authored prose cannot become executable control flow.
8. Return an immutable review result that still requires Citation Verifier and final deterministic release approval.

## Safety invariants

- The Advisor receives no retrieval, browser, entity-provider, database, filesystem, network, or mutation tools.
- The Advisor cannot introduce evidence or citations not admitted by the Coordinator-approved graph.
- The Advisor cannot mark citation verification complete.
- The Advisor cannot directly rewrite the draft; repair is expressed only as bounded reason codes for a later repair boundary.
- `approve` is advisory only and cannot release output.
- Missing, malformed, accessor-backed, cyclic, oversized, tampered, or mismatched inputs fail closed before provider invocation.
- The review is bound to the exact route digest, evidence graph, Composer output digest, execution ID, and invocation ID.
- Cancellation and deadline enforcement apply before, during, and after provider invocation.
- Automatic retries remain disabled unless explicitly proven safe by the hardened runner contract; the initial production adapter will use one attempt.

## Required structured output

The Advisor must return:

- `decision`: `approve`, `repair`, or `block`;
- `reasonCodes`: a bounded set from a deterministic allowlist;
- `unsupportedClaimIds`: admitted claim identifiers only;
- `citationRiskEvidenceIds`: admitted evidence identifiers only;
- `confidence`: finite value between 0 and 1.

Free-form explanations may be recorded for observability only after sanitation and must never drive execution.

## Required tests

- rejects forged or mismatched composition approval;
- rejects a draft whose digest does not match the successful Composer result;
- proves the model receives only approved evidence and the pending draft;
- proves permission class `none` and no tool surface;
- rejects arbitrary decision or repair reason codes;
- rejects claim and evidence IDs outside the approved graph;
- propagates cancellation before and after invocation;
- rejects malformed, accessor-backed, oversized, and over-token outputs;
- proves `approve` remains pending Citation Verifier and deterministic release approval;
- proves caller-owned objects are not mutated.

## Explicit non-goals

This phase does not:

- execute draft repair;
- perform citation verification;
- release output to users;
- wire production streaming;
- invoke Wikidata or DBpedia;
- replace deterministic Router, Coordinator, or final release authority.

## Follow-on

AI-I3I should implement the evidence-only Citation Verifier boundary. AI-I3J should then implement the final deterministic release decision that requires all route-mandated gates and matching immutable digests before any response can enter production streaming.
