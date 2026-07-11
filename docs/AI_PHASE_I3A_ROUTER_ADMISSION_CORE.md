# Phase AI-I3A: Hardened Router Admission Core

## Status

Implementation complete in isolation and awaiting final merge verification. This phase corrects and consolidates Router behavior before live chat-path wiring. It does not yet make Router admission mandatory for production chat execution.

## Purpose

AI-I3A removes the legacy Router's competing heuristics and establishes one canonical Router core with three explicit layers:

1. deterministic safety floor;
2. optional bounded Router-model proposal through the AI-I2 role runner;
3. monotonic merge that cannot weaken the floor.

The remaining AI-I3B work will insert this admission result after authentication/request validation and before model selection, research, tools, or streaming.

## Deterministic floor

The floor classifies:

- research versus explicit quick non-research chat;
- freshness requirements;
- legal, medical, financial, civic/election, safety, and other high-risk domains;
- critical immediate-risk cases;
- entity sensitivity;
- required source classes;
- source-quality review;
- Fusion planning;
- Advisor review;
- citation verification;
- bounded tool-call budgets.

Stable research may remain in quick mode. Requested quick mode cannot downgrade freshness, entity, high-risk, or critical policy. Deployment tool caps are applied before any model proposal.

## Entity sensitivity

Entity grounding is required for applicable:

- people and officeholders;
- companies and organizations;
- products and model numbers;
- places and events;
- works, papers, datasets, laws, and standards;
- ownership, employment, founding, authorship, and location relationships;
- aliases, acronyms, renamed entities, handles, repositories, and stable identifiers;
- ambiguous capitalized or name-like spans.

This routing requirement prepares the later AI-I7 stage, where Wikidata and DBpedia must be independently routed under bounded provider policy.

## Monotonic model merge

A Router model may add requirements but cannot:

- lower mode or risk below the deterministic floor;
- convert a required research route into non-research;
- remove freshness, entity grounding, source quality, Fusion, Advisor, or citation verification;
- increase the deterministic/deployment tool budget;
- re-enable deterministically disallowed source classes;
- remove required model roles.

Any final research mode necessarily promotes `requiresResearch` and citation verification. The final route is schema-validated, frozen, hashed with SHA-256, and bound to a branded trusted execution scope.

## Compatibility

`routeResearchRequest()` remains available for synchronous deterministic callers, but it now delegates to the canonical floor and never claims that a Router model was selected or invoked.

Historical `RoutePlan` construction remains source-compatible, while Router admission operates only on fully normalized `CanonicalRoutePlan` values.

Model-assisted callers must use `admitResearchRoute()`.

## Classification safeguards

- Bare ambiguous words are not sufficient to promote unrelated requests into a high-risk domain. For example, `basketball court` does not trigger legal classification.
- Legal court classification requires legal context such as a ruling, decision, legal case, or court of law.
- Stable explanatory research may use quick mode, while freshness, entity sensitivity, or high-risk requirements promote the route monotonically.
- Empty queries preserve the compatibility entrypoint's explicit `Query cannot be empty` error.

## Safety boundaries

- Router has no tool permission.
- Model invocation uses the AI-I2 role runner.
- Model output is strict structured data.
- Malformed, timed-out, cancelled, unavailable, or ineligible model execution falls back to the deterministic floor.
- Query, output, token, and deadline limits are bounded.
- Route reasons are allowlisted codes rather than hidden reasoning prose.
- Generated rationale is capped below the canonical schema limit.
- No authenticated scope is accepted from model output.
- No live chat, provider SDK, retrieval, Wikidata, DBpedia, database, or streaming path is changed in this subphase.

## Tests

Coverage includes:

- explicit non-research bypass;
- requested research-mode promotion;
- quick-mode downgrade attempts;
- stable quick research;
- high-risk and critical classification;
- ambiguous-domain false-positive regression cases;
- entity-sensitive fixtures;
- deployment budget caps;
- monotonic model merge;
- model-proposed research-mode promotion;
- model-added stricter requirements;
- bounded rationale generation;
- disallowed-source non-reenablement;
- AI-I2 Router invocation and scope binding;
- malformed model fallback;
- compatibility wrapper behavior;
- route immutability and digest generation.

## Completion gates

AI-I3A is ready to merge only when tests, type checking, lint, formatting, native configuration verification, and production build all pass on the permanent head. The final diff must contain no temporary workflow or diagnostic artifact, and every actionable review thread must be resolved against the final code.

## Next step

AI-I3B will wire Router admission into the chat entrypoint, build canonical model candidates from deployment configuration, adapt the selected provider to the AI-I2 Router interface, bind the route to the authenticated execution, and prevent governed research or streaming from starting without a valid route.
