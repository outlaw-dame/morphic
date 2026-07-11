# Phase AI-I3A: Hardened Router Admission Core

## Status

Implemented in isolation. This phase corrects and consolidates Router behavior before live chat-path wiring. It does not yet make Router admission mandatory for production chat execution.

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

Requested quick mode cannot downgrade high-risk or freshness policy. Deployment tool caps are applied before any model proposal.

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

The final route is schema-validated, frozen, hashed with SHA-256, and bound to a branded trusted execution scope.

## Compatibility

`routeResearchRequest()` remains available for synchronous deterministic callers, but it now delegates to the canonical floor and never claims that a Router model was selected or invoked.

Model-assisted callers must use `admitResearchRoute()`.

## Safety boundaries

- Router has no tool permission.
- Model invocation uses the AI-I2 role runner.
- Model output is strict structured data.
- Malformed, timed-out, cancelled, unavailable, or ineligible model execution falls back to the deterministic floor.
- Query, output, token, and deadline limits are bounded.
- Route reasons are allowlisted codes rather than hidden reasoning prose.
- No authenticated scope is accepted from model output.
- No live chat, provider SDK, retrieval, Wikidata, DBpedia, database, or streaming path is changed in this subphase.

## Tests

Coverage includes:

- explicit non-research bypass;
- quick-mode downgrade attempts;
- high-risk and critical classification;
- entity-sensitive fixtures;
- deployment budget caps;
- monotonic model merge;
- model-added stricter requirements;
- disallowed-source non-reenablement;
- AI-I2 Router invocation and scope binding;
- malformed model fallback;
- route immutability and digest generation.

## Next step

AI-I3B will wire Router admission into the chat entrypoint, build canonical model candidates from deployment configuration, adapt the selected provider to the AI-I2 Router interface, bind the route to the authenticated execution, and prevent governed research or streaming from starting without a valid route.
