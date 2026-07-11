# AI Architecture Phase Crosswalk and Drift Controls

## Authority

This document preserves useful requirements from the original AI architecture roadmap while mapping them into the canonical V2 integration sequence.

The V2 roadmap does not erase, replace, or weaken completed work or still-valid requirements from older documents. It changes only the future sequencing and completion accounting needed to reconcile the repository with actual implementation state.

Read together:

1. `AI_ARCHITECTURE.md` — enduring architecture doctrine.
2. `AI_ARCHITECTURE_IMPLEMENTATION_RECONCILIATION.md` — strict current-state audit.
3. `AI_ARCHITECTURE_PHASE_CROSSWALK.md` — requirement-preservation and phase mapping.
4. `AI_ARCHITECTURE_INTEGRATION_ROADMAP_V2.md` — canonical future implementation order.
5. Historical `AI_PHASE_*` documents — exact records of merged slices and their boundaries.

## Requirement disposition vocabulary

Every old requirement must have exactly one disposition:

- **completed-and-retained** — implemented, tested, still valid, and reused by the V2 architecture;
- **completed-but-not-integrated** — implemented in isolation but not guaranteed in the live path;
- **carried-forward** — still required and assigned to one or more V2 phases;
- **superseded-by-stronger-contract** — replaced only because the V2 requirement is stricter; the old safety intent remains mandatory;
- **historical-only** — useful context that no longer defines future sequencing;
- **rejected** — intentionally not carried forward, with a written rationale and approval requirement.

No requirement may disappear merely because its old phase number was reused or because a similarly named module exists.

## Anti-drift rules

1. **Stable phase identifiers**
   - V2 phases use `AI-I0` through `AI-I18`.
   - An existing identifier may never be reused for a different scope.
   - New work discovered between phases must use a suffix such as `AI-I4A`; it must not renumber later phases silently.

2. **One canonical status registry**
   - AI-I0 must add a machine-readable registry containing phase ID, title, status, dependencies, required artifacts, implementation PRs, tests, and superseded documents.
   - Markdown summaries are generated from or validated against that registry.

3. **Bidirectional traceability**
   - Every V2 phase must list the old requirements and merged slices it consumes.
   - Every old phase must map to at least one V2 phase or an explicit completed/historical disposition.

4. **No completion by name similarity**
   - A phase is not complete because a file, prompt, schema, class, or prior PR has a similar name.
   - Completion requires the live-path and exit criteria in the V2 roadmap.

5. **No undocumented scope mutation**
   - A PR may narrow a phase only by updating the canonical roadmap and crosswalk in the same PR.
   - A PR may expand a phase only when dependencies, threat model, tests, and rollout impact are updated.

6. **Architecture decision records**
   - Material changes to role boundaries, model authority, entity-provider behavior, retry policy, persistence, privacy, or production rollout require an ADR.
   - ADRs are append-only. Reversals reference the prior ADR rather than rewriting history.

7. **Documentation freshness gate**
   - A phase PR cannot merge when code behavior, schemas, tests, current-state reconciliation, crosswalk, and phase status disagree.
   - CI introduced in AI-I0 must detect missing mappings, duplicate phase IDs, invalid status transitions, broken document links, and completed phases without evidence.

8. **Historical documents remain immutable records**
   - Historical phase documents may receive a status banner, link corrections, or factual errata.
   - Their original claimed scope and boundaries must not be rewritten to resemble later work.

9. **Safety requirements are monotonic**
   - New documents may strengthen safety, privacy, reliability, and evidence requirements.
   - They may not weaken them without a dedicated ADR, threat analysis, migration plan, and explicit approval.

10. **Implementation proof is concrete**
    - Valid proof includes merged PRs, exact files, schemas, tests, CI runs, live integration tests, rollout evidence, and operational verification.
    - Aspirational prose, model-selection metadata, or an unused adapter is not implementation proof.

## Original roadmap to V2 crosswalk

### Original AI-0 — Baseline and safety inventory

Disposition: **completed-and-retained**, with live-path inventory refreshed in **AI-I0**.

Retained work:

- request-flow and evidence-entry inventory;
- retrieval/tool-schema mapping;
- test-gap identification;
- no-behavior-change baseline discipline.

V2 mapping:

- AI-I0 canonical contracts, status registry, and current live-flow inventory;
- AI-I14 trace completeness;
- AI-I15 architecture evaluations.

### Original AI-1 — Retrieval and crawling safety hardening

Disposition: **completed-and-retained**, with remaining provider-specific enforcement carried forward.

Retained work:

- SSRF and redirect validation;
- response-size and timeout bounds;
- hashed cache keys;
- serverless-safe cleanup behavior;
- untrusted-content handling;
- private-network and oversized-body tests.

V2 mapping:

- AI-I2 common role runner safety;
- AI-I5 Fusion retrieval execution;
- AI-I7 entity-provider network safety;
- AI-I15 adversarial evaluations;
- AI-I17 production enforcement.

### Original AI-2 and AI-2A — Shared schemas and model capability registry

Disposition: **completed-but-not-integrated**.

Retained work:

- shared schemas;
- capability inference;
- role eligibility checks;
- role model-selection helpers;
- rejection diagnostics.

V2 mapping:

- AI-I0 canonical lifecycle and role contracts;
- AI-I1 model registry and role-selection policy V2;
- AI-I2 role runner;
- AI-I3 Router model execution;
- AI-I4 Coordinator model assistance.

Required reconciliation:

- remove or document schema drift between original architecture examples and current code;
- strengthen Router/Coordinator capability requirements beyond structured output alone;
- add reliability, latency, context, tool, privacy, deployment, and cost policy;
- distinguish declared, verified, inferred, and unknown capabilities.

### Original AI-3 — Built-in role prompts and prompt governance

Disposition: **completed-but-not-integrated**.

Retained work:

- versioned prompts;
- role-output validation;
- prompt governance invariants;
- retrieved-content safety doctrine;
- personalization non-override rules.

V2 mapping:

- AI-I0 role contract reconciliation;
- AI-I2 hardened role runner;
- AI-I3 through AI-I13 role-specific integration;
- AI-I15 prompt-injection and governance evaluations.

### Original AI-4 — Router implementation

Disposition: **completed-but-not-integrated**.

Retained work:

- deterministic route plan;
- schema validation;
- deterministic fallback intent;
- high-risk and freshness heuristics;
- entity-grounding flag;
- model-candidate metadata.

V2 mapping:

- AI-I1 role model policy;
- AI-I2 role runner;
- AI-I3 live Router admission;
- AI-I15 Router evaluations;
- AI-I16 shadow comparison and staged rollout.

Required reconciliation:

- deterministic policy remains the minimum route;
- model output is validated and monotonically merged;
- the model cannot lower risk, remove required roles, enlarge budgets, or bypass entity grounding;
- live chat/research flow must consume the final route plan.

### Original AI-5 — Source Quality Engine

Disposition: **completed-but-not-integrated**.

Retained work:

- source taxonomy;
- evidence-role classification;
- bounded scoring and influence caps;
- weak/community-source policy;
- content-farm, scraper, AI-slop, and poisoning signals;
- separation of user preference from factual quality.

V2 mapping:

- AI-I6 evidence ingestion;
- AI-I8 source-quality enforcement;
- AI-I9 evidence-only composition;
- AI-I10 Advisor;
- AI-I11 Citation Verifier;
- AI-I15 evaluations.

### Original AI-6 — Entity Grounding Engine

Disposition: **completed-but-not-integrated**.

Retained work:

- entity extraction;
- Wikidata client;
- DBpedia client;
- candidate merge and resolution;
- confidence scoring;
- ambiguity flags;
- compatibility API.

V2 mapping:

- AI-I3 Router entity policy;
- AI-I4 Coordinator entity state and blocking;
- AI-I6 evidence attachment;
- AI-I7 Entity Grounding V2;
- AI-I10 Advisor entity-confusion review;
- AI-I15 disambiguation and provider-failure evaluations.

Required reconciliation:

- independently bounded Wikidata and DBpedia calls;
- fixed application-owned endpoints and no arbitrary SPARQL;
- provenance per provider;
- partial failure, disagreement, staleness, and confidence policy;
- mandatory grounding for applicable routes;
- current primary sources override knowledge graphs for current facts;
- unresolved material ambiguity blocks or forces an explicit caveat.

### Original AI-7 — Evidence Graph and normalization

Disposition: **completed-but-not-integrated**.

Retained work:

- URL canonicalization;
- normalized evidence items;
- claim extraction;
- duplicate/copy detection;
- source-quality and entity attachment;
- malformed-result isolation;
- conflict analysis added by later historical slices.

V2 mapping:

- AI-I5 Fusion outputs;
- AI-I6 complete evidence ingestion;
- AI-I8 source-quality admission;
- AI-I9 Composer input boundary;
- AI-I11 claim/citation verification;
- AI-I15 evaluations.

### Original AI-8 — Coordinator implementation

Disposition: **completed-but-not-integrated**.

Retained work:

- deterministic source-mix, freshness, entity, and contradiction policies;
- escalation and repair-plan metadata;
- Coordinator admission bridge;
- structured conflict details and repair hints;
- bounded repair planning;
- executor metadata and scoped persistence contracts.

V2 mapping:

- AI-I0 lifecycle contracts;
- AI-I4 live Coordinator finite-state machine;
- AI-I12 Repair Agent execution;
- AI-I13 repair re-verification;
- AI-I14 trace;
- AI-I16 restricted persistence integration.

Required reconciliation:

- Coordinator must govern the live lifecycle rather than only evaluate an isolated state object;
- deterministic blockers cannot be waived by a Coordinator model;
- state transitions, budgets, retries, cancellation, and terminal states must be explicit;
- persisted state remains disabled until restricted integration and operations are verified.

### Original AI-9 — Provider-agnostic Fusion

Disposition: **carried-forward**.

V2 mapping: **AI-I5**.

All original requirements remain mandatory:

- provider-independent path planning and execution;
- independent evidence paths;
- normalization into evidence items;
- consensus and contradiction comparison;
- optional OpenRouter acceleration only;
- structured output rather than prose summaries.

Additional V2 requirements:

- Coordinator-owned budgets and cancellation;
- per-path timeouts and concurrency limits;
- source-class and entity-path requirements from Router;
- duplicate and content-laundering resistance;
- privacy-safe failure records.

### Original AI-10 — Answer Composer integration

Disposition: **carried-forward**.

V2 mapping: **AI-I9**.

All original requirements remain mandatory, strengthened so governed routes cannot compose directly from raw retrieval or opaque subtask prose.

### Original AI-11 — Provider-agnostic Advisor

Disposition: **carried-forward**.

V2 mapping: **AI-I10**.

All original requirements remain mandatory, including provider independence and optional OpenRouter acceleration only.

### Original AI-12 — Citation Verifier and Repair Agent

Disposition: **carried-forward and split for safety**.

V2 mapping:

- AI-I11 Citation Verifier;
- AI-I12 bounded Repair Agent;
- AI-I13 re-verification and release gate.

The split is a **superseded-by-stronger-contract** disposition: verification, mutation, and final release are separated so repair cannot approve its own output.

### Original AI-13 — Research trace and observability

Disposition: **carried-forward**.

V2 mapping: **AI-I14**.

All privacy restrictions remain mandatory, including no private chain-of-thought, secrets, raw private prompts, or unnecessary sensitive content.

### Original AI-14 — Architecture behavior evaluations

Disposition: **carried-forward**.

V2 mapping: **AI-I15**.

All original evaluation areas remain mandatory and are expanded to cover:

- deterministic/model route merge;
- Coordinator transition safety;
- role permission isolation;
- entity-provider partial failure and disagreement;
- prompt injection;
- timeout, cancellation, retry, and budget exhaustion;
- repair replay and re-verification;
- persistence scope and IDOR resistance.

### Original AI-15 — Morphic integration stabilization

Disposition: **carried-forward**.

V2 mapping:

- AI-I16 restricted infrastructure integration;
- AI-I17 shadow integration and staged rollout;
- AI-I18 production enforcement and legacy-path removal.

The V2 split is stricter because code integration, operational readiness, shadow comparison, and production enforcement require separate evidence.

### Original AI-16 — Internal package boundary inside Morphic

Disposition: **carried-forward**, but deferred until live integration stabilizes.

V2 mapping:

- boundaries established incrementally in AI-I0 through AI-I15;
- formal internal package rehearsal in AI-I18 or the extraction-decision phase after live enforcement.

Original adapter requirements remain mandatory: model invocation, search, fetch, entity lookup, telemetry, citation rendering, and persistence.

### Original AI-17 — Monorepo/library extraction decision

Disposition: **carried-forward**.

V2 mapping: **AI-I18 extraction decision after production enforcement**, or a separately approved post-I18 phase if production evidence is not mature.

All original decision gates remain mandatory. Extraction cannot be justified only by code quantity or aesthetic package boundaries.

### Original AI-18 — Monorepo/library creation

Disposition: **conditional-carried-forward**.

It is executed only after the original AI-17 decision conditions and V2 production-enforcement gates pass. The suggested package responsibilities and adapter boundaries remain useful design input, not an approved extraction action.

## Historical implementation slices after original AI-8

The later merged slices must be preserved by actual scope rather than their reused phase number. They provide reusable Coordinator and repair infrastructure, including:

- Coordinator admission metadata;
- structured conflict analysis and details;
- conflict repair hints;
- bounded repair plans and priority protection;
- audited executor metadata;
- caller executor state;
- repair-state snapshots;
- authenticated owner/execution scope binding;
- storage-neutral persistence adapters;
- bounded persistence operations;
- adapter conformance;
- in-memory reference persistence;
- production persistence declaration validation;
- PostgreSQL repair-state schema and adapter.

These map primarily into AI-I4, AI-I12, AI-I13, AI-I14, and AI-I16. They must not be discarded, duplicated, or prematurely enabled.

## Pull request requirements

Every AI architecture PR must include:

- canonical V2 phase ID;
- old-phase requirements consumed;
- historical implementation slices reused;
- explicit non-goals;
- threat-model changes;
- schema and prompt versions changed;
- deterministic policies changed;
- model permissions changed;
- tests and evals added;
- live-path status: isolated, integrated, enforced, or production-enabled;
- documentation and registry updates;
- rollback or disable path where behavior changes.

A PR description that says only “completes phase” is insufficient.

## Completion transition rules

Allowed status transitions:

```text
planned -> in_progress -> implemented_in_isolation -> integrated -> enforced -> production_enabled
```

Additional terminal states:

```text
blocked
superseded
cancelled
```

Rules:

- transitions cannot skip required evidence;
- `superseded` requires a replacement phase and ADR;
- `cancelled` requires rationale and confirmation that no safety requirement was dropped;
- regression moves a phase back to the last proven state;
- production disablement moves `production_enabled` back to `enforced` or `integrated` as appropriate.

## CI controls to add in AI-I0

AI-I0 must implement checks that fail when:

- phase IDs are duplicated;
- a phase is missing from the crosswalk;
- an old requirement has no disposition;
- a completed phase lacks implementation evidence;
- a V2 phase references a nonexistent dependency;
- status transitions are invalid;
- docs disagree with the machine-readable registry;
- role names, schemas, prompts, or capability requirements drift;
- the live execution graph omits a required role;
- entity-mandatory routes lack Wikidata/DBpedia policy coverage;
- generated documentation is stale.

## Decision

Old documentation remains valuable and is retained.

The V2 roadmap controls future order and completion accounting. The original roadmap continues to supply requirements through this crosswalk. Historical phase documents remain immutable implementation records. No old requirement is considered removed unless this crosswalk marks it rejected with an approved rationale.