# Phase AI-I3J: Final Deterministic Release Capability

## Status

Implemented on a dedicated branch from merged AI-I3I commit `360e855cde54f039d6e3efc48ec496f21a054d52`. Production streaming remains unchanged until a later wiring and rollout phase consumes this capability.

## Objective

Create the final model-free authority that determines whether a governed draft may be exposed to production streaming. No model role may self-authorize release. Release requires an exact, untampered chain from Router admission through Coordinator approval, composition, route-mandated Advisor review, and Citation Verification.

## Implemented release order

1. Revalidate the immutable Router execution context and route digest.
2. Require the exact branded Coordinator composition approval for the same evidence-graph instance.
3. Require Router authorization for answer composition and route-mandated Citation Verification.
4. Validate the exact branded Citation Verification result.
5. Through that verification, validate the exact Composer output and exact branded Advisor review when the route mandates Advisor.
6. Require all participating role results to share one execution ID.
7. Reject invalid, future-dated, failed, cancelled, or digest-mismatched role results.
8. Issue a short-lived, immutable, unforgeable release authorization.
9. Require explicit one-time consumption against the same route before returning releasable draft data.

## Security invariants

- The release gate is deterministic and invokes no model, provider, network, browser, retrieval, filesystem, database, or mutation tool.
- Advisor approval is bound by object identity and immutable metadata to the exact route digest, Composer output digest, and evidence-graph instance.
- Citation Verification is similarly bound to the exact route, evidence graph, Composer digest, and Advisor digest.
- Research drafts with no cited evidence cannot be citation-verified or released.
- Structurally copied or forged Advisor, Citation Verification, or release objects are rejected.
- Role results from different execution IDs cannot be combined.
- Release authorizations have a bounded lifetime of 1–120 seconds and default to 60 seconds.
- Expired authorizations fail closed and are permanently consumed.
- Successful authorizations are single-use to reduce replay risk.
- Route mismatches, upstream mutation, and digest mismatches fail closed.
- The authorization exposes only the approved draft, admitted citation IDs, execution ID, route digest, and upstream output digests.

## PR #92 post-merge corrections included

- Advisor approvals can no longer be reused for a different draft, route, evidence graph, or execution chain.
- Citation Verification now requires at least one cited evidence item and a verified result must contain at least one verified evidence ID.
- Advisor structured arrays are normalized before the hardened role runner records their output digest.

## Test coverage

- exact high-risk chain authorizes and releases once;
- repeated consumption is rejected;
- structurally forged release capabilities are rejected;
- expired capabilities fail closed and cannot later be reused;
- mixed execution IDs are rejected;
- Advisor approval replay across compositions is rejected;
- uncited research drafts are rejected before Citation Verifier invocation;
- route mismatches are rejected;
- upstream object and digest integrity is rechecked during consumption.

## Explicit non-goals

This phase does not:

- replace the existing production streaming path;
- wire release consumption into the HTTP or UI stream;
- implement repair execution;
- invoke Wikidata or DBpedia;
- perform shadow rollout, percentage rollout, or rollback automation;
- persist release capabilities across processes.

## Follow-on

The next integration phase should wire the governed retrieval → Coordinator → Composer → Advisor → Citation Verifier → deterministic release chain into production behind explicit shadow and rollout controls. It must consume the one-time authorization immediately before streaming, preserve cancellation, emit route and release telemetry without sensitive content, and retain a fail-closed rollback path.
