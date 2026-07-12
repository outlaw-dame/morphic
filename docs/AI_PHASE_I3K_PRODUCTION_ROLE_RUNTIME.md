# AI-I3K — Production Role Runtime Configuration

## Objective

Provide a truthful server-only bridge from deployment configuration to the canonical AI-I1 role selector. The runtime must not infer governed-role eligibility from the model selected by the chat UI.

## Configuration

`MORPHIC_GOVERNED_ROLE_CANDIDATES_JSON` contains a versioned JSON object with candidate metadata. It must not contain API keys, access tokens, prompts, user data, or query content.

Each candidate declares:

- provider and model identity;
- model family, locality, availability, and reliability;
- context, latency, and cost bounds;
- capability assertions with explicit provenance;
- role-specific evaluation scores, fixture versions, and verification timestamps;
- optional provider cooldown time.

## Fail-closed behavior

The runtime is unavailable when:

- configuration is absent, blank, malformed, oversized, or has unknown fields;
- a candidate identity is duplicated;
- a provider is unsupported by the production registry;
- deterministic time is invalid;
- any required production role lacks an eligible candidate under its canonical AI-I1 profile;
- capability provenance is weaker than the role profile requires;
- role evaluation evidence is missing, stale, or below the minimum score;
- a candidate is disabled, deprecated, unavailable, cooling down, too slow, too costly, or has insufficient context.

No partial runtime plan is returned. Composer, Advisor, and Citation Verifier must all be eligible before governed execution may start.

## Security boundary

- Only trusted server configuration is read.
- Client cookies, request bodies, headers, model output, and query text cannot supply or modify candidate metadata.
- The selected chat model does not automatically become a governed-role candidate.
- Provider secrets remain in the existing provider registry and are never embedded in this configuration.
- Runtime reason codes are bounded and contain no secrets or user content.

## Remaining work

This slice validates and selects role candidates. A later slice must construct provider adapters from the selected identities, verify provider availability, create one trusted execution scope, and wire the resulting adapters into the governed production chain behind the disabled-by-default rollout policy.
