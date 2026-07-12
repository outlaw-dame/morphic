# Phase AI-I5A — Production Fusion Planner

## Canonical mapping

This implementation slice belongs to canonical **Phase AI-I5: Fusion planning and bounded retrieval execution** in `AI_ARCHITECTURE_INTEGRATION_ROADMAP_V2.md`.

## Purpose

Implement the canonical Fusion Planner as a real hardened model role before production retrieval. The planner creates independent, bounded retrieval lanes; it does not retrieve evidence or answer the user.

## Security and governance contract

- Executes only through the common hardened role runner as `fusion_planner`.
- Uses the canonical `retrieval_plan_only` permission class.
- Receives no browser, network, database, filesystem, retrieval, or mutation tools.
- Revalidates the immutable Router execution context and digest.
- Accepts only bounded query and route metadata.
- Produces at most eight strictly validated retrieval paths.
- Rejects duplicate path identifiers.
- Rejects disallowed source classes.
- Requires every Router-mandated source class to have a retrieval lane.
- Requires a freshness lane when freshness is mandatory.
- Requires an entity-disambiguation lane when entity grounding is mandatory.
- Preserves caller cancellation and performs no automatic retry.

## Output

Each path contains only:

- a bounded stable identifier;
- a bounded retrieval query;
- an allowed source class;
- an allowlisted evidence role;
- a bounded result count;
- an explicit freshness requirement.

The output remains a retrieval plan. It is not evidence, composition approval, or release authorization.

## Remaining AI-I5 work

- Bind the validated Fusion plan to the exact retrieval execution.
- Make the production search executor consume the approved paths.
- Construct production role providers and scopes from deployed model metadata.
- Enforce bounded concurrency, deadlines, retry policy, safe-fetch controls, provenance, and partial-failure semantics.
- Feed every result into the common evidence-normalization boundary.
