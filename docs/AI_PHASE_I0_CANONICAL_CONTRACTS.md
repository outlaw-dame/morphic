# Phase AI-I0: Canonical Contracts and Drift Controls

## Status

This phase implements the first code-enforced governance layer for the canonical AI integration roadmap. It is additive and does not wire Router, Coordinator, model calls, Wikidata, DBpedia, retrieval, repair execution, or PostgreSQL into the live request path.

## Canonical sources

Future AI work must read these documents together:

1. `AI_ARCHITECTURE.md` for enduring doctrine and role boundaries;
2. `AI_ARCHITECTURE_IMPLEMENTATION_RECONCILIATION.md` for strict current status;
3. `AI_ARCHITECTURE_PHASE_CROSSWALK.md` for preservation of old requirements;
4. `AI_ARCHITECTURE_INTEGRATION_ROADMAP_V2.md` for future sequencing;
5. historical `AI_PHASE_*` documents for exact merged-slice evidence.

The V2 roadmap changes future ordering. It does not erase beneficial old requirements or broaden historical completion claims.

## Added contracts

`lib/ai/architecture/contracts.ts` defines versioned, bounded contracts for:

- role execution requests and results;
- route decision provenance;
- Coordinator lifecycle states and transitions;
- tool, retrieval-path, and model-call budgets;
- Wikidata and DBpedia provider results and provenance;
- privacy-safe role failure classes;
- final release, refusal, and caveat decisions;
- architecture implementation status.

Authenticated owner and execution scope are intentionally not accepted as model-controlled fields. Scope binding remains the responsibility of trusted orchestration and persistence boundaries.

## Adversarial parsing boundary

`contract-boundary.ts` extracts plain data before schema validation. It rejects:

- unknown schema versions;
- extra privileged fields through strict schemas;
- accessors without invoking them;
- symbol keys;
- class instances and unexpected prototypes;
- sparse arrays and custom array properties;
- cycles;
- non-finite numbers;
- excessive nesting and oversized object graphs;
- unsupported values such as functions and bigints.

External callers receive one coarse `InvalidArchitectureContractError`. Raw values, secrets, accessors, and detailed validation internals are not exposed through that error.

## Canonical roles

The shared `ModelRoleSchema` is the only role taxonomy. It now includes the previously documented `fusion_planner` role. Capability policy, prompt governance, output parser coverage, and the phase registry import that same schema rather than copying role unions.

This addition does not claim that Fusion Planner is integrated. Its current output parser remains deliberately unimplemented (`unknown`) until AI-I5 defines the versioned Fusion path contract.

## Lifecycle contract

`lifecycle.ts` defines one legal Coordinator transition graph. Terminal states are immutable:

- `released`;
- `refused_or_caveated`;
- `cancelled`;
- `failed`.

The transition metadata includes an expected revision and event identifier so AI-I4 can add compare-and-swap persistence and idempotent event handling without changing the canonical shape.

## Machine-readable phase registry

`phase-registry.ts` defines stable IDs `AI-I0` through `AI-I18`, dependencies, required roles, historical requirement mappings, status, and implementation evidence.

Registry validation detects:

- duplicate or missing phase IDs;
- duplicate, unknown, or forward dependencies;
- advanced status claims without evidence;
- integrated phases whose dependencies are not integrated;
- loss of explicit Wikidata and DBpedia requirement coverage.

The registry currently marks AI-I0 as `implemented_in_isolation`. Nothing is marked integrated, enforced, or production-enabled.

## Compatibility and migration rules

1. Contract version `1` is the only accepted version in this phase.
2. Unknown versions fail closed; they are not normalized into version `1`.
3. New optional fields may be introduced only in a new schema version when strict parsing would otherwise reject them.
4. Privileged fields, authenticated scope, tool permissions, and budgets may never be silently defaulted from untrusted payloads.
5. Persisted lifecycle state migrations must be explicit, deterministic, bounded, and tested before a new version is accepted.
6. A migration may strengthen requirements but may not silently reduce risk, remove mandatory roles, expand budgets, or remove provenance.
7. Historical phase identifiers are never persisted as lifecycle states or used as proof of integration.
8. Status progression is monotonic: documented → scaffolded → implemented in isolation → integrated → enforced → production-enabled.
9. Status rollback is allowed when evidence is invalidated, but it must be explicit and documented; code must not infer a higher status from file names or phase numbers.

## Tests

The AI-I0 tests cover:

- valid role execution contracts;
- unknown versions and extra privileged fields;
- getter non-execution;
- symbols, class instances, cycles, and sparse arrays;
- failure/result consistency;
- budget overflow rejection;
- release-without-verification rejection;
- Wikidata and DBpedia provenance;
- complete ordered phase registry;
- shared role coverage including Fusion Planner;
- duplicate IDs, forward dependencies, and missing entity-provider requirements;
- legal and illegal lifecycle transitions;
- terminal-state immutability;
- revision-bound transition metadata.

## Boundaries and next phase

AI-I0 does not alter live chat behavior and makes no production-enable claims.

After CI and review validate this phase, the next phase is AI-I1: model registry and role-selection policy V2. AI-I1 must use these canonical contracts and must update the registry, crosswalk, documentation, tests, and implementation evidence together.
