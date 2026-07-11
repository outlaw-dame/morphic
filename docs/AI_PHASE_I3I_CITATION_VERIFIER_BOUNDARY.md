# Phase AI-I3I: Evidence-Bound Citation Verifier Boundary

## Status

Implemented on a dedicated branch from verified AI-I3H merge `959f6078d39d50de7af0d3730d38b6538696457e`. Production chat and streaming remain unchanged.

## Objective

Add a production-facing Citation Verifier boundary that checks the exact pending Composer draft against only the exact cited evidence admitted by the deterministic Coordinator. The verifier cannot retrieve, browse, mutate evidence, rewrite the draft, or release output.

## Required execution order

1. Revalidate the immutable Router execution context and route digest.
2. Require the exact unforgeable Coordinator composition approval.
3. Revalidate the successful Composer result and bind to its exact output digest.
4. When the route requires Advisor review, require a successful exact Advisor approval and bind to its output digest.
5. Project only the draft, cited evidence, admitted claim identifiers, warnings, conflicts, and immutable digests into the verifier input.
6. Invoke canonical role `citation_verifier` through the hardened role runner with permission class `none`.
7. Validate a strict `verified`, `repair`, or `block` result and canonical reason codes.
8. Reject evidence and claim identifiers outside the cited evidence set.
9. Require every cited evidence item to be explicitly verified before returning `verified`.
10. Return an immutable result that remains pending the final deterministic release decision.

## Safety invariants

- The verifier receives no retrieval, browser, entity-provider, database, filesystem, network, or mutation tools.
- Uncited evidence is not projected into the model input.
- Coordinator approval cannot be structurally forged or reused with another evidence graph or route digest.
- A route-mandated Advisor must explicitly approve before verification may run.
- Advisor `repair` or `block` decisions fail closed before provider invocation.
- Composer and Advisor digests bind the verifier to exact upstream outputs.
- `verified` requires exactly `citations_verified`, no unresolved IDs, and all cited evidence IDs in the verified set.
- Model-authored identifiers are constrained to admitted evidence and claim IDs.
- Cancellation and deadlines remain enforced before, during, and after invocation.
- Automatic retries are disabled for the initial production verifier adapter.
- A verifier result cannot release output to users.

## Structured output

The verifier returns:

- `decision`: `verified`, `repair`, or `block`;
- `reasonCodes`: a bounded deterministic allowlist;
- `verifiedEvidenceIds`: cited evidence explicitly verified;
- `unsupportedEvidenceIds`: cited evidence that does not support its draft use;
- `missingCitationClaimIds`: admitted claims needing citation repair;
- `confidence`: finite value between zero and one.

## Test coverage

- verifies that only cited Coordinator-approved evidence reaches the model;
- proves permission class `none` and no tool surface;
- rejects forged Coordinator approval;
- rejects non-approving Advisor state;
- requires every cited evidence item for a verified result;
- rejects model references outside the cited evidence set;
- rejects malformed verified output;
- preserves caller cancellation semantics;
- proves successful verification remains pending deterministic release.

## Explicit non-goals

This phase does not:

- execute repair;
- retrieve new evidence;
- invoke Wikidata or DBpedia;
- replace deterministic Router, Coordinator, or release authority;
- wire production streaming;
- release a response to users.

## Follow-on

AI-I3J should implement the final deterministic release capability. It must require matching route, Composer, Advisor-when-required, and Citation Verifier digests; enforce all route-mandated completed roles; reject repair or block states; and issue an unforgeable release authorization before any response can enter production streaming.
