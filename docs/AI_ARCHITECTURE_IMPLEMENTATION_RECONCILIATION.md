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
2. establishing a new canonical integration roadmap in `AI_ARCHITECTURE_INTEGRATION_ROADMAP_V2.md`;
3. pausing the previously proposed AI-27 database-integration work until the live model-role architecture is correctly mapped and gated;
4. requiring code, documentation, tests, and live wiring to agree before a role is called integrated.

## Current implementation matrix

| Capability | Current code state | Live-path state | Required correction |
| --- | --- | --- | --- |
| Shared schemas | Implemented and tested | Imported by isolated AI modules | Keep schemas canonical; add versioned execution contracts and compatibility tests |
| Model capability registry | Implemented | Used for role candidate filtering in isolated paths | Replace broad provider inference with explicit confidence/provenance and role-specific requirements |
| Role prompts | Implemented and versioned | Not proven as the live role execution boundary | Add a common role runner and prompt/output audit metadata |
| Router | Deterministic implementation exists | Not proven to run before every live research request | Integrate it at request admission; add model-backed bounded classification with deterministic fallback |
| Router model selection | Candidate selection exists | Selected model is metadata only in the deterministic Router | Add actual invocation, timeout, validation, fallback, and model-quality policy |
| Coordinator | Deterministic policies and admission metadata exist | Not proven to supervise the live researcher loop | Create a live state machine and enforce Coordinator admission before composition |
| Coordinator model | Prompt and capability role exist | No Coordinator model execution | Add bounded model judgment only after deterministic policies; model cannot waive blocking rules |
| Source Quality Engine | Deterministic classifier/scorer exists | Evidence normalization can call it | Guarantee all evidence paths normalize and score before composition |
| Entity extraction | Implemented | Used when explicit entity grounding is called | Route entity-sensitive queries and evidence through it automatically |
| Wikidata client | Implemented | Not guaranteed for applicable live requests | Make it a bounded entity-provider path selected by entity policy |
| DBpedia client | Implemented | Not guaranteed for applicable live requests | Make it a bounded independent entity-provider path selected by entity policy |
| Entity resolution | Implemented | Evidence can carry resolved entities | Add provider provenance, disagreement handling, canonical identity sets, and live enforcement |
| Entity grounding policy | Coordinator policy exists | Can block isolated Coordinator admission | Ensure live Coordinator receives entity results and cannot compose through missing mandatory grounding |
| Evidence normalization | Implemented for search results | Not proven for every retrieval/tool result | Add adapters for every evidence-producing tool and reject opaque prose truth blobs |
| Evidence graph | Implemented with dedupe/conflict metadata | Not proven as the sole Composer input | Make graph construction mandatory for adaptive/deep/critical composition |
| Fusion | Architecture documented | No complete provider-agnostic live Fusion executor proven | Implement planner, independent path executor, budget manager, normalization, and partial-failure semantics |
| Answer Composer role | Schema/prompt scaffolded | Existing researcher still performs answer work | Create evidence-only Composer boundary and prevent raw-result composition on governed routes |
| Advisor | Schema/prompt scaffolded | No provider-agnostic live Advisor proven | Implement validated findings, deterministic admission policy, and family-diversity preference |
| Citation Verifier | Schema/prompt scaffolded | No complete live claim-level verification gate proven | Implement claim extraction, evidence mapping, verdicts, and blocking policy |
| Repair Agent | Extensive deterministic repair metadata and persistence work exists | Live repair execution remains intentionally absent | Connect only after Advisor/Verifier contracts, idempotency, authorization, and bounded execution are complete |
| Research trace | Doctrine exists | No complete end-to-end trace proven | Add privacy-safe structured lifecycle trace with retention and access policy |
| Architecture evaluations | Individual unit tests exist | No end-to-end role/evidence safety suite proven | Add replayable integration, adversarial, model-quality, and regression evaluations |
| PostgreSQL repair persistence | Concrete adapter and schema exist | Not wired to live Coordinator repair execution | Keep disabled until live role architecture, restricted query integration, and operational controls are complete |

## Router reconciliation

### What exists

`lib/ai/router/router.ts` creates a deterministic `RoutePlan`, validates it, and records a selected Router-capable model identifier when candidates are provided.

### What does not yet exist

Selecting a candidate is not the same as running a Router model. The current Router does not establish that:

- every governed request enters through Router admission;
- a model invocation occurs;
- model output is parsed and compared with deterministic policy;
- malformed, timed-out, or adversarial model output falls back safely;
- model choice is based on measured routing quality;
- entity-sensitive routing is comprehensive;
- route decisions are carried through the live execution state without mutation or downgrade.

### Required target

The Router must become a two-layer controller:

1. **Deterministic policy floor**
   - validates input;
   - identifies non-negotiable freshness, high-risk, search, entity, and verification requirements;
   - applies user-requested mode only when it does not weaken policy;
   - sets hard upper bounds and minimum required stages.

2. **Bounded Router model**
   - performs nuanced intent, ambiguity, domain, and decomposition classification;
   - emits only the versioned route schema;
   - cannot remove deterministic minimum requirements;
   - has strict timeout and output-size bounds;
   - is not given secrets, untrusted fetched content, or user-owned data unrelated to routing;
   - falls back to the deterministic route on any failure.

The final route is the monotonic safety merge of the deterministic floor and valid model proposal.

## Coordinator reconciliation

### What exists

The deterministic Coordinator evaluates source mix, entity grounding, freshness, and contradictions and produces repair and escalation metadata. Later slices add admission metadata, bounded repair plans, executor-state contracts, authenticated scope binding, persistence contracts, and PostgreSQL storage.

### What does not yet exist

The code does not yet prove that a live research execution:

- creates one authoritative Coordinator execution state;
- advances through a finite state machine;
- records completed role outputs by schema version;
- cannot compose while blocking policies remain;
- invokes a Coordinator model when bounded judgment is useful;
- executes retrieval or entity repairs;
- invokes Advisor and Verifier gates;
- resolves ambiguous mutation outcomes before retry;
- resumes safely after persistence reload.

### Required target

The Coordinator must be a deterministic state machine with an optional bounded model assistant.

The deterministic Coordinator owns:

- lifecycle state;
- allowed transitions;
- budgets;
- required stages;
- evidence and source minimums;
- entity-grounding admission;
- contradiction and freshness gates;
- Advisor and Verifier requirements;
- repair admission;
- retry and idempotency policy;
- terminal status.

The Coordinator model may:

- recommend retrieval decomposition;
- identify semantic gaps not captured by rules;
- summarize contradictions into structured, non-authoritative findings;
- propose escalation within allowed actions.

The Coordinator model may not:

- waive deterministic blockers;
- enlarge budgets;
- select unauthorized tools or data;
- modify authenticated scope;
- declare unsupported evidence sufficient;
- directly answer the user;
- directly persist or execute arbitrary actions.

## Model-role reconciliation

Morphic's canonical internal roles are:

1. Router
2. Coordinator
3. Fusion Planner
4. Retriever/query-expansion role
5. Source Quality classifier
6. Entity Grounding assistant
7. Answer Composer
8. Advisor
9. Citation Verifier
10. Repair Agent

A deployment may reuse the same underlying model, but role executions remain separate records with separate prompts, inputs, outputs, budgets, and validation.

### Role-selection requirements

The current generic capability sorting is not sufficient as the final policy. Each role needs:

- required capabilities;
- preferred capabilities;
- disallowed deployment classes;
- minimum reliability evidence;
- latency class;
- context requirement;
- privacy/locality requirement;
- tool-access policy;
- structured-output strategy;
- fallback chain;
- measured evaluation score;
- model-family diversity preference where independent critique is valuable.

Provider defaults must be treated as inferred, not verified. Explicit provider/model metadata and measured behavior must outrank name-based inference.

## Entity architecture reconciliation

### Required routing rule

When the final route marks entity grounding as mandatory, live execution must run the Entity Grounding stage before composition.

Applicable cases include:

- people, officeholders, authors, founders, executives, and public figures;
- organizations, subsidiaries, parent companies, brands, and institutions;
- products, models, versions, and similarly named software projects;
- places, jurisdictions, venues, and locations with shared names;
- events, creative works, papers, datasets, laws, standards, and identifiers;
- aliases, renamed entities, acronyms, transliterations, and collisions;
- ownership, membership, employment, location, chronology, and relationship claims;
- any evidence set containing inconsistent entity identifiers or descriptions.

### Wikidata and DBpedia responsibilities

Wikidata and DBpedia are structured entity providers, not general authorities for current claims.

They should be used, where applicable, for:

- canonical identifiers;
- labels and aliases;
- entity type hints;
- cross-language names;
- parent/child organization hints;
- locations and jurisdiction hints;
- dates and relationship consistency checks;
- disambiguation candidates;
- cross-provider identity linking.

They must not silently override fresher official or primary evidence for current facts.

### Provider execution policy

For mandatory entity grounding:

- query Wikidata and DBpedia independently under separate timeouts;
- use fixed application-owned endpoint templates;
- never execute user- or model-supplied arbitrary SPARQL;
- cap mentions, requests, response bytes, candidates, aliases, and relationships;
- sanitize and encode query text;
- validate response content type and schema;
- apply SSRF, redirect, DNS, and egress controls through the shared safe network layer;
- use bounded concurrency;
- apply retry only to idempotent reads with bounded exponential backoff and jitter;
- respect `Retry-After` when valid and bounded;
- avoid retries for deterministic 4xx responses;
- cache normalized provider results with versioned keys and bounded TTL;
- retain provider-specific provenance;
- treat partial provider failure as degraded grounding, not fabricated agreement;
- reduce confidence when providers disagree;
- surface unresolved ambiguity to Coordinator;
- require disambiguating primary retrieval or an explicit caveat when ambiguity remains material.

### Entity result contract

The current `ResolvedEntity` contract should evolve to preserve:

- a stable internal entity ID;
- canonical display name;
- normalized mention text;
- entity type and confidence;
- Wikidata ID when present;
- DBpedia URI when present;
- aliases with source provenance;
- relationship assertions with provenance and timestamps;
- candidate set and rejected-candidate reasons;
- ambiguity severity;
- supporting evidence IDs;
- provider retrieval timestamps;
- whether a fact is identity metadata or a current claim;
- contradiction/disagreement metadata.

## Live target execution graph

```text
Authenticated request
  -> request validation and privacy boundary
  -> deterministic Router floor
  -> optional bounded Router model
  -> monotonic route merge and schema validation
  -> Coordinator execution creation
  -> Fusion planning when required
  -> bounded independent retrieval paths
  -> evidence normalization for every tool output
  -> source-quality assessment
  -> entity extraction
  -> Wikidata / DBpedia / primary-evidence entity grounding when applicable
  -> evidence graph construction and conflict analysis
  -> Coordinator admission
       -> retrieve/ground/clarify/escalate while blockers remain
       -> or allow evidence-only composition
  -> Answer Composer
  -> Advisor when required
  -> Citation Verifier
  -> bounded Repair Agent when required
  -> re-verification after every repair
  -> final Coordinator release decision
  -> streamed final answer and privacy-safe trace
```

No role may skip directly from raw search output to a final answer on adaptive, deep, critical, or entity-mandatory routes.

## Documentation authority

After this reconciliation lands:

1. `AI_ARCHITECTURE.md` remains the architecture doctrine.
2. `AI_ARCHITECTURE_IMPLEMENTATION_RECONCILIATION.md` is the authority for current implementation status.
3. `AI_ARCHITECTURE_INTEGRATION_ROADMAP_V2.md` is the authority for future integration order and exit criteria.
4. The original `AI_ARCHITECTURE_INTEGRATION_PHASES.md` remains a historical design roadmap and must not be used alone to infer completion.
5. Individual `AI_PHASE_*` documents describe merged slices only; they do not override the reconciliation or V2 roadmap.

## Immediate decision

The previously proposed AI-27 restricted PostgreSQL query integration is paused as the next coding phase.

The next coding work must start with the V2 integration prerequisites, beginning with canonical execution contracts and live Router admission. PostgreSQL repair-state integration remains valuable, but enabling it before the role lifecycle is correct would persist an incomplete orchestration model and make later corrections harder and riskier.
