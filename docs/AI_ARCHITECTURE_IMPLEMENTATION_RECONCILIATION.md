# AI Architecture Implementation Reconciliation

## Status

This document is the canonical reconciliation between Morphic's AI architecture documents and the code currently present in the repository.

It does not claim that a documented component is live merely because a schema, prompt, policy, adapter, or test exists. The status terms in this document are deliberately strict:

- **documented**: described in architecture documentation only;
- **scaffolded**: schemas, prompts, interfaces, or isolated helpers exist;
- **implemented in isolation**: executable code and tests exist, but the component is not guaranteed in the live request path;
- **integrated**: the live research path invokes the component under an explicit contract;
- **enforced**: downstream execution cannot bypass the component when policy requires it;
- **production-enabled**: deployment configuration, credentials, operations, monitoring, and rollback have been verified.

Only the last three states describe live architecture behavior.

## Requirement preservation

This reconciliation must be read with [AI Architecture Phase Crosswalk and Drift Controls](./AI_ARCHITECTURE_PHASE_CROSSWALK.md).

The V2 roadmap supersedes future phase ordering, not beneficial architecture requirements. The crosswalk gives every original requirement one explicit disposition and maps completed isolated work into the V2 phases that will integrate and enforce it. Historical phase documents remain evidence of their actual merged scope and must not be rewritten to imply broader completion.

## Why this reconciliation is required

The original integration roadmap and the subsequent implementation phase names diverged after the deterministic Coordinator work.

The original roadmap defined:

- AI-9 as provider-agnostic Fusion;
- AI-10 as Answer Composer integration;
- AI-11 as Advisor;
- AI-12 as Citation Verifier and Repair Agent;
- AI-13 as research trace;
- AI-14 as architecture behavior evaluations.

The implementation series later reused those numbers for different Coordinator admission, conflict, bounded repair, executor-state, and persistence slices. Those implementations are valuable and must be retained, but their phase numbers do not prove completion of the original Fusion, Composer, Advisor, Verifier, trace, or evaluation phases.

This document resolves that ambiguity by:

1. treating merged implementation work as historical implementation slices with their actual scope;
2. treating the V2 roadmap as the canonical future implementation order;
3. using the crosswalk to preserve and map every beneficial old requirement;
4. requiring live-path proof before claiming integration, enforcement, or production enablement.

## Current architecture status summary

| Capability | Current strict status | Evidence and limitation |
| --- | --- | --- |
| Retrieval safety | implemented in isolation and used by existing retrieval paths | Safe fetch, bounds, redirects, cache-key handling, and tests exist; each new provider still requires explicit adoption and verification. |
| Shared AI schemas | scaffolded and used by isolated modules | Schemas exist, but lifecycle and role-execution contracts are not yet canonical end to end. |
| Model capability registry | implemented in isolation | Capability inference and role selection exist; verified capability provenance and complete role policy are not yet integrated. |
| Role prompts | scaffolded | Versioned prompts and output parsers exist; most roles are not invoked through a common hardened runner. |
| Router | implemented in isolation | Deterministic route generation and model-candidate metadata exist; no bounded Router-model invocation or live admission enforcement is proven. |
| Source Quality | implemented in isolation | Classification and caps exist; governed live composition does not yet universally enforce them. |
| Entity Grounding | implemented in isolation | Wikidata/DBpedia clients, extraction, resolution, and ambiguity exist; applicable live requests are not guaranteed to invoke them. |
| Evidence Graph | implemented in isolation | Normalization, dedupe, claims, entities, and conflict analysis exist; all live evidence entry paths are not yet unified. |
| Coordinator | implemented in isolation | Deterministic policies, admission, bounded repair metadata, and persistence contracts exist; it is not yet the authoritative live lifecycle controller. |
| Fusion | documented and partially scaffolded by related evidence work | Provider-agnostic independent path planning and execution are not complete end to end. |
| Composer | documented | Existing researcher output is not yet proven to be governed evidence-only composition. |
| Advisor | scaffolded by prompt/schema work | No complete live provider-agnostic Advisor release gate is proven. |
| Citation Verifier | scaffolded by prompt/schema work | No complete live claim-support release gate is proven. |
| Repair Agent | substantial deterministic metadata and persistence implemented in isolation | Live bounded repair execution and independent re-verification are not enabled. |
| Trace | partially scaffolded by metadata | Complete privacy-safe lifecycle trace is not integrated. |
| Architecture evals | incomplete | Unit tests exist by slice; end-to-end behavioral and adversarial eval gates do not yet prove the architecture. |
| PostgreSQL repair persistence | implemented in isolation | Schema and adapter exist; restricted query integration, operations, rollout, and live enablement remain deferred. |

## Router reconciliation

### Existing beneficial work

- deterministic query classification;
- schema-validated route plan;
- freshness and high-risk heuristics;
- entity-grounding requirement flag;
- required role list;
- bounded tool-call metadata;
- deterministic fallback intent;
- role-model candidate selection metadata.

### Missing integration

- common role runner invocation;
- validated Router-model output;
- deterministic/model monotonic merge;
- live request admission before researcher execution;
- route-plan propagation through retrieval, evidence, Coordinator, composition, verification, and trace;
- comprehensive entity-sensitive and ambiguity detection;
- shadow and adversarial Router evaluations.

### Required authority boundary

The deterministic Router defines the minimum safe route. A Router model may add risk, roles, grounding, verification, or stricter budgets. It may not lower risk, remove requirements, increase maximum budgets, select unauthorized tools, or bypass policy.

## Coordinator reconciliation

### Existing beneficial work

- source-mix, freshness, entity, and contradiction policies;
- escalation policy;
- repair plans and conflict hints;
- bounded repair planning and executor metadata;
- admission output;
- authenticated repair-state scope;
- storage-neutral persistence contracts and conformance;
- in-memory and PostgreSQL adapters.

### Missing integration

- authoritative lifecycle state machine;
- live state transitions from route through final release;
- common Coordinator-model runner and bounded recommendation schema;
- non-waivable deterministic merge;
- actual retrieval and role dispatch under Coordinator budgets;
- cancellation and terminal-state semantics;
- live repair execution and independent re-verification;
- restricted persistence integration and operations.

## Entity Grounding reconciliation

### Existing beneficial work

- deterministic mention extraction;
- Wikidata and DBpedia lookup clients;
- concurrent provider lookup;
- candidate merging and canonical IDs;
- confidence and ambiguity metadata;
- evidence entity attachment;
- Coordinator policy that blocks absent required grounding and warns on ambiguity.

### Missing integration

- Router classification broad enough to identify all material entity-sensitive routes;
- mandatory invocation in the live path;
- independent provider timeout, retry, concurrency, and response bounds;
- fixed endpoint and egress policy verification;
- provider provenance and disagreement records;
- explicit partial-failure semantics;
- current-primary-source precedence checks;
- ambiguity repair loop and final caveat/block policy;
- entity-grounding end-to-end evaluations.

## Documentation and status discipline

Future work must not edit historical phase documents to make old slices appear broader. Instead:

- correct factual errata narrowly;
- add a non-destructive status banner or crosswalk link where useful;
- update the current entrypoint, reconciliation, crosswalk, V2 roadmap, registry, and ADRs;
- attach concrete implementation evidence to status transitions;
- preserve every old requirement unless explicitly rejected through the governed process.

## Decision

The next coding phase remains AI-I0. Its first responsibility is to turn these documentation controls into code-validated contracts and a machine-readable status registry. AI-27 database integration remains deferred until the crosswalk dependencies and V2 integration gates are satisfied.