# AI Architecture Integration Roadmap V2

## Status and authority

This is the canonical forward implementation plan for Morphic's AI architecture.

It supersedes the original phase ordering for future work because implementation numbering drifted after the initial Router, Source Quality, Entity Grounding, Evidence Graph, and deterministic Coordinator slices. Historical `AI_PHASE_*` documents remain accurate descriptions of the isolated work they record, but they do not prove that the original end-to-end model-role architecture is integrated.

No phase in this roadmap is complete merely because a similarly named schema, prompt, helper, policy, or adapter exists. Completion requires the stated live-path, safety, test, and operational exit criteria.

The previously proposed database-focused AI-27 work is deferred until the integration gates below are complete. The existing PostgreSQL repair-state adapter remains disabled from live orchestration.

## Non-negotiable architecture principles

1. Deterministic policy is the safety floor; model judgment may add requirements but may not remove them.
2. Router, Coordinator, Fusion Planner, Retriever, Source Quality, Entity Grounding, Composer, Advisor, Citation Verifier, and Repair Agent are separate execution roles even when one underlying model serves multiple roles.
3. Every role has a versioned input schema, output schema, prompt version, timeout, token/output bound, cancellation signal, model-selection record, and privacy-safe result record.
4. Fetched content is untrusted data. It cannot alter system policy, role definitions, tool permissions, authenticated scope, budgets, or output schemas.
5. Adaptive, deep, critical, and entity-mandatory routes compose only from normalized evidence graph data.
6. Wikidata and DBpedia are independently routed entity providers where entity grounding applies; they do not override fresher primary evidence for current facts.
7. High-risk and critical routes require source-quality admission, Advisor review, and citation verification.
8. Repair is bounded, idempotent where possible, re-verified, and unable to introduce unsupported facts.
9. No automatic retry is allowed for a mutation whose commit outcome is ambiguous.
10. Traces expose structured decisions, not private chain-of-thought, secrets, or unnecessary sensitive content.
11. Production enablement requires deployment, credential, data-retention, backup, restore, monitoring, and rollback verification—not code declarations alone.
12. A phase may not be marked complete while code, documentation, schemas, tests, and live behavior disagree.

## Canonical target roles

### Router

Purpose: classify the request and establish the minimum safe execution plan.

Inputs:

- normalized user query;
- authenticated request metadata limited to routing needs;
- explicitly requested research mode;
- available role-model capability profiles;
- deployment policy profile.

Outputs:

- versioned `RoutePlan`;
- deterministic-floor decisions;
- optional model-proposed decisions;
- monotonic merged route;
- selected model and fallback metadata;
- bounded rationale codes, not hidden reasoning prose.

The Router cannot answer the user, call arbitrary tools, weaken risk policy, remove required entity grounding, or expand budgets beyond deployment caps.

### Coordinator

Purpose: own the research lifecycle and release the final answer only after all required stages pass.

Inputs:

- immutable route plan;
- authenticated execution scope;
- versioned execution state;
- role results;
- evidence graph;
- policy and budget state.

Outputs:

- legal state transition;
- required next actions;
- blocking and warning policy results;
- escalation and repair admission;
- final release or refuse/caveat decision.

The Coordinator model is advisory to the deterministic state machine and cannot waive blockers or mutate scope.

### Fusion Planner

Purpose: convert the route into independent evidence paths with distinct evidence roles.

It cannot execute arbitrary URLs, exceed route budgets, or return prose as evidence.

### Retriever/query-expansion role

Purpose: create bounded search/query variants and invoke only allowlisted retrieval tools through deterministic executors.

It never receives raw credentials and never controls low-level network destinations directly.

### Source Quality role

Purpose: supplement deterministic source classification for ambiguous cases.

Deterministic domain, evidence-role, influence-cap, and high-risk source rules remain authoritative.

### Entity Grounding role

Purpose: extract and reconcile entity candidates across the query, evidence, Wikidata, DBpedia, and primary sources.

It cannot invent canonical identifiers or treat knowledge-graph metadata as current primary evidence.

### Answer Composer

Purpose: write from admitted structured evidence only.

It cannot retrieve, alter evidence, add uncited facts, or see evidence excluded by policy.

### Advisor

Purpose: independently critique the draft against route requirements, source quality, entities, contradictions, freshness, citations, privacy, and safety.

Prefer a different model family from Composer when an eligible alternative exists and the privacy/deployment policy allows it.

### Citation Verifier

Purpose: map atomic draft claims to evidence and assign supported, partially supported, unsupported, or contradicted verdicts.

Unsupported high-risk claims block release.

### Repair Agent

Purpose: execute only Coordinator-approved bounded repairs against a fixed draft/evidence set or approved additional retrieval steps.

Every repair is re-verified. The Repair Agent cannot broaden its own plan or introduce new facts without admitted evidence.

## Phase AI-I0: Canonical contracts and phase reconciliation

### Goal

Create one authoritative set of execution contracts and eliminate documentation/code ambiguity before live wiring.

### Required work

- Adopt `AI_ARCHITECTURE_IMPLEMENTATION_RECONCILIATION.md` and this roadmap as canonical.
- Add explicit lifecycle phase/status enums independent of historical PR phase numbers.
- Add versioned schemas for:
  - role execution request;
  - role execution result;
  - route decision provenance;
  - Coordinator state and transition;
  - tool budget ledger;
  - entity-provider result and provenance;
  - role failure classification;
  - final release decision.
- Define compatibility and migration rules for persisted state.
- Add a machine-readable feature/status registry showing scaffolded, integrated, enforced, and production-enabled states.
- Add architecture invariant tests that fail when required role mappings or schema versions drift.

### Security requirements

- Reject unknown schema versions.
- Reject extra privileged fields and accessor/prototype tricks at untrusted boundaries.
- Separate authenticated scope from model-provided or persisted payloads.
- Use opaque execution identifiers.
- Bound all strings, arrays, maps, and nested records.
- Return allowlisted coarse external errors while retaining privacy-safe internal reason codes.

### Exit criteria

- One schema source of truth exists.
- Historical phase numbering cannot be mistaken for target-role completion.
- Every later phase imports canonical contracts.
- Tests detect schema, role-list, and lifecycle-transition drift.

## Phase AI-I1: Model registry and role-selection policy V2

### Goal

Select models by verified role fitness rather than broad provider inference or capability count alone.

### Required work

- Extend capability profiles with provenance:
  - provider-declared;
  - deployment-configured;
  - model-card declared;
  - inferred;
  - evaluation-verified;
  - unknown.
- Add role profiles containing:
  - hard capabilities;
  - preferred capabilities;
  - minimum reliability tier;
  - context requirement;
  - latency ceiling;
  - cost ceiling;
  - local/remote/privacy restrictions;
  - tool permission class;
  - structured-output strategy;
  - fallback chain;
  - model-family diversity preference.
- Add measured role-quality scores from evaluation fixtures.
- Make explicit configured capabilities outrank inference.
- Treat provider defaults as low-confidence until verified.
- Reject unavailable, disabled, deprecated, or policy-incompatible models.
- Add deterministic tie-breaking and non-mutating selection.
- Add circuit-breaker/cooldown metadata for repeatedly failing model endpoints without hiding permanent configuration errors.

### Role minimums

- Router: structured output, low latency, routing-eval threshold.
- Coordinator: structured output, strong instruction following, sufficient reasoning quality.
- Fusion Planner: structured output and decomposition-eval threshold.
- Retriever: tool calling only through approved executor and cancellation support.
- Source Quality: structured output and classification-eval threshold.
- Entity Grounding: structured output and entity-disambiguation threshold.
- Composer: streaming, long enough context, citation-preservation threshold.
- Advisor: structured output, critique threshold, preferably different family from Composer.
- Verifier: structured output and claim-evidence entailment threshold.
- Repair: structured output, edit-preservation and no-new-facts threshold.

### Tests

- capability provenance precedence;
- privacy/locality exclusion;
- fallback order;
- diversity preference;
- unavailable model rejection;
- deterministic selection;
- no mutation of caller model arrays;
- role-evaluation threshold enforcement.

### Exit criteria

- Every role resolves to an eligible model or an explicit deterministic/no-model fallback.
- No role invocation depends solely on provider-name inference.
- Selection decisions are traceable without exposing secrets.

## Phase AI-I2: Common role runner

### Goal

Create one hardened invocation boundary for all internal model roles.

### Required work

- Implement a generic role runner with role-specific adapters.
- Inputs include role, schema version, prompt version, model selection, bounded context, deadline, abort signal, and trace identifiers.
- Enforce:
  - timeout;
  - max input size;
  - max output size;
  - token budget;
  - cancellation;
  - structured-output parsing;
  - provider exception normalization;
  - bounded idempotent read retry only where safe;
  - no retries for ambiguous side-effectful calls;
  - privacy-safe logging;
  - prompt-injection isolation.
- Distinguish failure classes:
  - invalid input;
  - no eligible model;
  - timeout;
  - cancelled;
  - transient provider failure;
  - permanent provider/configuration failure;
  - malformed output;
  - schema-version mismatch;
  - policy violation.
- Preserve raw model output only under an explicitly approved secure debugging policy; default traces store parsed bounded metadata only.
- Add deterministic fallback hooks per role.

### Tests

- timeout and abort races;
- oversized input/output;
- malformed JSON and schema mismatch;
- hostile object/proxy parsing boundaries;
- transient retry bounds and jitter policy;
- permanent error no-retry behavior;
- secret and prompt-content redaction;
- model fallback selection;
- duplicate completion suppression.

### Exit criteria

- Router, Coordinator, and every later model role use this runner.
- No role has a bespoke unbounded provider call path.

## Phase AI-I3: Live Router admission

### Goal

Run a validated route before every governed research execution.

### Required work

- Insert Router admission after authentication/request validation and before researcher/tool execution.
- Preserve quick non-research chat compatibility through an explicit bypass route, not an accidental bypass.
- Build deterministic route floor for:
  - search requirement;
  - freshness;
  - high-risk domains;
  - entity sensitivity;
  - source-quality requirement;
  - Fusion requirement;
  - Advisor requirement;
  - citation-verification requirement;
  - maximum budgets.
- Invoke bounded Router model for nuanced classification.
- Merge model output monotonically:
  - boolean safety requirements use logical OR where either layer requires the stage;
  - risk and mode cannot be downgraded below deterministic floor;
  - budgets use the stricter bounded value;
  - required source classes are unioned subject to policy;
  - disallowed source/tool classes cannot be re-enabled by model output.
- Validate final route schema.
- Freeze route and bind it to execution scope.
- Add route reason codes and prompt/model metadata to trace.

### Entity routing requirements

The deterministic floor must trigger entity analysis for:

- explicit person, organization, product, place, event, work, paper, law, standard, or dataset questions;
- “who/what/which company owns/works for/founded/created/located” relations;
- aliases, acronyms, renamed entities, versions, model numbers, handles, repositories, and identifiers;
- ambiguous capitalized/name-like spans when answer accuracy depends on identity;
- current officeholder/role-holder questions;
- evidence or query terms known to have collisions.

The model may add entity grounding for subtler cases but cannot remove deterministic grounding.

### Tests and evaluations

- low-risk stable query;
- current/fresh query;
- legal/medical/financial/civic/safety query;
- ambiguous person/company/place/product names;
- prompt injection asking Router to skip safeguards;
- requested quick mode attempting to downgrade critical policy;
- malformed/timed-out model output fallback;
- route immutability and scope binding;
- latency and budget regression.

### Exit criteria

- Governed research cannot begin without a valid frozen route.
- Router model is actually invoked when configured and safely falls back when not.
- Entity-sensitive fixtures reliably require entity grounding.

## Phase AI-I4: Coordinator finite-state machine

### Goal

Replace loosely connected admission helpers with one authoritative lifecycle controller.

### Required states

- `created`
- `routed`
- `planning`
- `retrieving`
- `normalizing_evidence`
- `grounding_entities`
- `evaluating_evidence`
- `awaiting_repairs`
- `composing`
- `advising`
- `verifying`
- `repairing`
- `ready_for_release`
- `released`
- `refused_or_caveated`
- `cancelled`
- `failed`

### Required work

- Define legal transitions and terminal states.
- Make transition application compare-and-swap compatible.
- Bind state to authenticated owner and execution scope.
- Store role result references by role/schema/prompt/model version.
- Add budget ledger for tool calls, retrieval paths, model calls, tokens, and elapsed deadlines.
- Make repeated completion events idempotent.
- Reject stale transition revisions.
- Add deterministic policies as transition guards.
- Add optional Coordinator model assessment after deterministic checks.
- Coordinator model may propose only allowlisted actions.
- Require reason codes for every block, escalation, caveat, and release.

### Tests

- every legal and illegal transition;
- stale revision races;
- duplicate events;
- cancellation at each nonterminal stage;
- scope/IDOR attempts;
- malformed persisted state;
- budget exhaustion;
- model recommendation attempting to waive blocker;
- resume from each persisted state;
- terminal-state immutability.

### Exit criteria

- The live flow advances only through the Coordinator state machine.
- Composition cannot begin while deterministic blockers remain.
- Coordinator model is bounded and subordinate to transition guards.

## Phase AI-I5: Fusion planning and bounded retrieval execution

### Goal

Implement the provider-agnostic Fusion architecture that the original roadmap described but later phase numbering did not deliver.

### Required work

- Implement Fusion Planner role and deterministic planner validation.
- Define path purposes and minimum diversity by route/domain.
- Generate independent paths for applicable source roles:
  - official/primary;
  - government/regulatory/legal;
  - academic/standards;
  - established or specialist reporting;
  - current-news;
  - fact-check;
  - community experience with capped influence;
  - entity knowledge graph;
  - local/map/feed where appropriate.
- Deduplicate semantically equivalent paths before execution.
- Execute paths with bounded concurrency and per-path deadlines.
- Use shared safe-fetch/search network controls.
- Enforce domain allow/deny policies after redirects and DNS resolution.
- Normalize partial failures without treating missing paths as agreement.
- Track retrieval provenance and budget consumption.
- Keep OpenRouter Fusion optional and normalize it into the same internal contract.

### Retry policy

- Retry only idempotent retrieval reads classified as transient.
- Use capped exponential backoff with jitter.
- Honor bounded valid `Retry-After`.
- Do not retry invalid requests, policy denials, schema errors, or deterministic 4xx responses.
- Ensure cancellation interrupts backoff and in-flight work.

### Tests

- path diversity;
- duplicate path collapse;
- tool budget enforcement;
- SSRF and redirect defenses;
- partial failure;
- timeout/cancellation;
- retry exhaustion;
- community-source cap;
- OpenRouter adapter equivalence;
- no opaque prose evidence output.

### Exit criteria

- Fusion runs without any provider-specific server tool.
- Every result enters the common evidence normalization boundary.

## Phase AI-I6: Evidence ingestion completeness

### Goal

Make the evidence graph the complete substrate for governed composition.

### Required work

Add or verify adapters for every evidence-producing path:

- ordinary search;
- advanced search;
- fetched pages;
- feeds;
- maps/local results;
- fact checks;
- repository/code sources where supported;
- academic sources;
- Fusion provider adapters;
- Wikidata;
- DBpedia;
- research subtasks.

Each adapter must:

- validate and canonicalize URLs/identifiers;
- strip credentials/fragments where applicable;
- bound text and metadata;
- classify source and evidence role;
- attach retrieval path and timestamps;
- attach entity references and provider provenance;
- extract bounded atomic claims;
- isolate malformed items rather than crash the full batch;
- mark duplicates/copied content;
- avoid counting syndicated/copied evidence as independent corroboration.

Subtask outputs may propose evidence references but cannot enter the graph as unsupported truth blobs.

### Tests

- adapter contract suite across every producer;
- malformed item isolation;
- copy/syndication detection;
- URL canonicalization;
- credential stripping;
- oversized content;
- invalid dates;
- provenance preservation;
- source-quality attachment;
- entity attachment;
- deterministic IDs.

### Exit criteria

- Adaptive/deep/critical paths have no direct raw-result-to-Composer route.
- Every admitted claim traces to normalized evidence.

## Phase AI-I7: Entity Grounding V2 with mandatory Wikidata/DBpedia routing

### Goal

Make entity identity, ambiguity, and relationship handling a first-class enforced stage.

### Required work

- Expand entity extraction across query and normalized evidence claims.
- Add deterministic entity-sensitivity and ambiguity scoring.
- Create provider adapters for Wikidata and DBpedia using fixed application-owned requests.
- Route both providers independently when entity grounding is mandatory, unless deployment policy explicitly disables one and records degraded coverage.
- Add primary-evidence entity extraction for current roles/relationships.
- Reconcile candidate sets using IDs, labels, aliases, types, descriptions, locations, dates, and relationships.
- Preserve provider-specific facts and timestamps instead of flattening disagreement.
- Separate identity metadata from current factual assertions.
- Add canonical internal entity IDs and mention-to-entity links.
- Add confidence calibration and ambiguity severity.
- Add disambiguating retrieval actions.
- Attach resolved entities to evidence and claims.
- Block composition when material identity ambiguity remains on governed routes, unless final output explicitly asks the user for clarification or provides a bounded caveat.

### Network and abuse controls

- shared safe network client;
- fixed endpoint allowlist;
- HTTPS enforcement;
- DNS/redirect validation;
- request and response byte limits;
- content-type validation;
- mention/candidate/alias/relationship caps;
- bounded concurrency;
- idempotent read retry with capped exponential backoff and jitter;
- normalized cache keys with schema/provider/version;
- bounded TTL and negative caching;
- no arbitrary SPARQL from users or models;
- no provider response HTML execution;
- privacy-safe query logging.

### Failure semantics

- both providers agree: confidence may increase subject to evidence quality;
- one provider succeeds: mark partial coverage;
- providers disagree: preserve both candidates, reduce confidence, request disambiguation;
- both fail: Coordinator decides primary-source disambiguation, clarification, or caveat;
- stale knowledge graph versus fresh primary evidence: use graph for identity and primary evidence for current claim;
- no canonical entity found: preserve unresolved mention; never invent an ID.

### Tests and evaluations

- same-name people;
- company versus product;
- parent/subsidiary relationships;
- renamed organizations;
- multilingual aliases/transliterations;
- places sharing names;
- work/author collisions;
- current officeholder versus historical holder;
- provider disagreement;
- one-provider outage;
- malicious query text;
- oversized/invalid provider responses;
- cache isolation;
- no arbitrary SPARQL;
- current-primary-evidence precedence.

### Exit criteria

- Routes marked entity-mandatory cannot bypass the entity stage.
- Wikidata and DBpedia are invoked according to explicit provider policy.
- Material ambiguity reaches Coordinator and blocks or caveats composition.

## Phase AI-I8: Source-quality and evidence-admission enforcement

### Goal

Guarantee that all evidence receives claim-specific quality treatment before composition.

### Required work

- Apply deterministic source taxonomy and evidence-role classification to every evidence item.
- Invoke bounded Source Quality model only for unresolved classifications.
- Keep user source preferences separate from factual quality.
- Enforce high-risk minimum source classes.
- Enforce influence caps for forums, social sources, wikis/knowledge graphs, vendors, and aggregators by claim type.
- Add freshness and primary-source requirements by claim type.
- Detect content farms, scrapers, copied reporting, synthetic/AI-slop signals, and poisoning attempts.
- Require independent corroboration rather than URL count.
- Feed quality summaries and deficits into Coordinator.

### Tests

- user-trusted weak source cannot become authoritative;
- blocked source removal does not boost competitors' factual weight;
- copied sources do not corroborate each other;
- community experience remains usable for experience claims;
- Wikidata/DBpedia remain background/entity evidence, not current-news authority;
- high-risk weak-source-only graph blocks composition.

### Exit criteria

- Composer receives only admitted evidence and influence metadata.
- Coordinator can deterministically identify insufficient source mixes.

## Phase AI-I9: Evidence-only Answer Composer

### Goal

Separate answer writing from retrieval, planning, and evidence judgment.

### Required work

- Define Composer input as route, admitted evidence graph projection, entity summary, required caveats, citation format, and answer UX constraints.
- Exclude raw fetched instructions and unadmitted evidence.
- Give Composer no retrieval or mutation tools.
- Require claim-to-evidence references in structured intermediate output before rendering.
- Enforce wording distinctions:
  - confirmed fact;
  - reported claim;
  - community experience;
  - unresolved contradiction;
  - uncertainty/caveat.
- Add bounded streaming adapter that cannot emit final release until verification completes; buffer or mark draft stream internally as needed.
- Preserve citation IDs through rendering.

### Tests and evaluations

- no-new-facts;
- evidence omission and conflicting evidence;
- entity ambiguity preservation;
- community-source wording;
- citation ID preservation;
- malicious evidence prompt injection;
- output size/cancellation;
- high-risk caveat requirements.

### Exit criteria

- Governed routes cannot use the existing monolithic researcher as unrestricted Composer.
- Every draft claim is mappable to evidence IDs.

## Phase AI-I10: Advisor integration

### Goal

Add an independent structured critique gate.

### Required work

- Invoke Advisor after composition when route requires it or deterministic policy escalates.
- Prefer eligible model-family diversity from Composer.
- Validate findings schema and bounds.
- Review:
  - unsupported claims;
  - bad citations;
  - source diversity;
  - stale evidence;
  - contradictions;
  - entity confusion;
  - overconfidence;
  - weak-source overuse;
  - privacy/safety violations;
  - route requirement violations.
- Convert findings into deterministic block/warn/note admission.
- Do not let Advisor edit the answer directly.

### Tests

- malformed findings;
- false clean pass against deterministic blocker;
- family-diversity selection;
- bounded findings count;
- duplicated findings;
- prompt injection in draft/evidence;
- privacy-safe trace output.

### Exit criteria

- Required Advisor review cannot be skipped.
- Advisor clean output cannot override deterministic failures.

## Phase AI-I11: Citation Verifier integration

### Goal

Establish claim-level support before release.

### Required work

- Extract or consume structured draft claims.
- Map each claim to cited evidence IDs.
- Verify entailment, scope, entity identity, date/freshness, and claim type.
- Distinguish supported, partially supported, unsupported, and contradicted.
- Require exact support for numbers, dates, quotations, legal conclusions, medical claims, financial claims, current roles, and safety claims.
- Detect citation laundering through weak sources that merely repeat another source.
- Produce deterministic release blockers.

### Tests and evaluations

- citation present but irrelevant;
- overbroad claim;
- wrong entity;
- stale current claim;
- numeric mismatch;
- quotation mismatch;
- copied-source laundering;
- partial support;
- unsupported high-risk claim;
- model verifier disagreement with deterministic checks.

### Exit criteria

- Unsupported or contradicted required claims cannot be released.
- Verification result is preserved for repair and trace.

## Phase AI-I12: Bounded Repair Agent and re-verification

### Goal

Connect the existing repair planning/state/persistence foundation to safe, real repair execution.

### Required work

- Define allowlisted executable repair actions:
  - remove unsupported claim;
  - narrow overbroad wording;
  - add required caveat;
  - replace bad citation with already admitted evidence;
  - resolve entity reference using admitted grounding;
  - request bounded additional retrieval;
  - request clarification;
  - refuse unsupported answer.
- Separate pure text repairs from retrieval repairs.
- Require Coordinator-issued immutable plan and step IDs.
- Bind plan to route, evidence revision, draft revision, owner scope, and execution scope.
- Enforce idempotency and attempt caps.
- Use persisted compare-and-swap state only after restricted database integration is complete.
- Re-run Advisor/Verifier checks required by the repaired fields.
- Prevent the Repair Agent from introducing uncited facts or expanding scope.

### Tests

- replay and duplicate execution;
- stale draft/evidence revision;
- cross-scope plan substitution;
- plan mutation attempts;
- exhausted attempts;
- ambiguous mutation result;
- repair adds new fact;
- targeted re-verification;
- cancellation and resume.

### Exit criteria

- Repair execution is bounded, scoped, persisted safely, and always re-verified.

## Phase AI-I13: Research trace, observability, and privacy

### Goal

Make role and policy behavior diagnosable without exposing private reasoning or sensitive data.

### Required work

Trace structured metadata for:

- route floor/model/final merge;
- model selection and fallback;
- Coordinator transitions;
- Fusion paths and tool budgets;
- evidence counts/classes/deduplication;
- entity providers, IDs, ambiguity, and degraded coverage;
- source-quality summaries;
- Advisor findings;
- verification verdicts;
- repair steps and outcomes;
- final release reason.

Do not log:

- private chain-of-thought;
- secrets or credentials;
- raw authorization headers;
- unnecessary full fetched content;
- unnecessary user-owned/private source material;
- unrestricted raw model prompts/outputs.

Add retention, deletion, access control, redaction, sampling, and incident-review policy.

### Exit criteria

- Developers can explain lifecycle decisions from structured trace data.
- Trace access and retention are explicit and tested.

## Phase AI-I14: End-to-end architecture evaluations

### Goal

Prove the architecture, not just isolated functions.

### Required evaluation suites

- Router classification and downgrade resistance;
- Coordinator transition and blocker enforcement;
- model-role selection and fallback;
- Fusion diversity and budget behavior;
- source quality and influence caps;
- entity disambiguation using Wikidata/DBpedia/primary evidence;
- evidence normalization completeness;
- prompt injection and tool-instruction resistance;
- Composer no-new-facts behavior;
- Advisor issue detection;
- citation entailment and entity/date precision;
- Repair no-new-facts and re-verification;
- cancellation, timeout, retry, and partial failure;
- persistence concurrency, IDOR, resume, and deletion;
- privacy-safe traces;
- latency and cost budgets.

Use deterministic fixtures plus carefully controlled model evaluations. Store expected policy outcomes separately from model wording. Add regression fixtures for every production incident and meaningful review finding.

### Exit criteria

- Required safety and correctness thresholds are defined and met.
- CI runs deterministic architecture tests.
- Model-evaluation regressions block promotion according to documented thresholds.

## Phase AI-I15: Restricted PostgreSQL integration and operations

### Goal

Resume the deferred database integration only after the live lifecycle and repair contracts are stable.

### Required work

- Implement restricted query adapter with transaction-local owner/execution scope settings.
- Use a least-privileged application role that cannot bypass forced RLS.
- Add real PostgreSQL integration tests for:
  - create/update/delete CAS;
  - concurrent writers;
  - RLS isolation;
  - transaction-local scope reset;
  - malformed envelope checks;
  - migration upgrade/rollback strategy;
  - cancellation and connection failure;
  - ambiguous commit handling;
  - retention deletion;
  - backup/restore verification fixtures.
- Integrate secret-manager credentials, TLS verification, rotation, monitoring, and pool limits.
- Add operational runbooks for migration, rollback, restore, credential compromise, and data deletion.

### Exit criteria

- The Phase AI-25 production contract is verified by configuration and tests, not merely declared.
- Persistence is wired only to authenticated Coordinator repair execution.

## Phase AI-I16: Shadow integration and staged rollout

### Goal

Introduce the architecture without silently degrading existing answers.

### Required work

- Run Router/Coordinator/evidence/entity/verification pipeline in shadow mode first.
- Compare existing and target path decisions without exposing shadow output to users.
- Measure false blocks, missed high-risk routes, entity ambiguity, citation failures, latency, cost, and provider reliability.
- Add feature flags by role, route mode, provider, and deployment.
- Use canary cohorts and immediate rollback.
- Never send private data to a new remote provider solely for experimentation without deployment policy approval.

### Exit criteria

- Shadow thresholds pass.
- Rollback is tested.
- Production rollout proceeds from quick/adaptive low-risk routes to deep/critical only after evidence.

## Phase AI-I17: Production enforcement and legacy-path removal

### Goal

Make the target architecture authoritative and remove bypasses.

### Required work

- Enforce Router admission for governed requests.
- Enforce Coordinator state machine.
- Enforce evidence graph input for governed composition.
- Enforce entity stage where required.
- Enforce Advisor/Verifier gates.
- Remove or explicitly quarantine legacy monolithic orchestration paths.
- Remove obsolete phase-status claims and lint/format deferrals associated with superseded slices.
- Update operator and developer documentation.

### Exit criteria

- No undocumented bypass exists.
- Code, docs, tests, traces, and production flags agree.
- Legacy path removal has rollback/migration evidence.

## Phase AI-I18: Extraction decision

### Goal

Reassess whether stable contracts should move into reusable packages or a monorepo.

Potential packages:

- schemas and lifecycle contracts;
- role runner and model registry;
- Router policy;
- Coordinator state machine;
- source quality;
- entity grounding;
- evidence graph;
- Fusion;
- Advisor/Verifier/Repair;
- trace schemas.

Extraction occurs only when package boundaries are proven by live Morphic integration and do not force app-specific authentication, streaming UI, storage, or deployment details into reusable cores.

## Definition of done for every phase

A phase is complete only when:

- implementation matches this roadmap;
- relevant docs are updated;
- unit, integration, adversarial, and concurrency tests are added where applicable;
- CI passes format, lint, typecheck, tests, build, and relevant migration checks;
- no unresolved actionable review comments remain;
- no duplicate or obsolete code path was introduced;
- errors, retries, timeouts, cancellation, and partial failures are defined;
- privacy, authorization, IDOR, SSRF, injection, and resource-exhaustion risks are addressed;
- feature flags and production status are stated honestly;
- the component is not described as integrated or production-enabled unless it actually is.

## Immediate next coding phase

After this documentation/reconciliation PR merges, begin **Phase AI-I0: Canonical contracts and phase reconciliation**, not the previously proposed database AI-27 implementation.

The first implementation PR should be deliberately narrow:

1. add lifecycle and role-execution schemas;
2. add the machine-readable implementation-status registry;
3. add invariant tests tying canonical roles, prompts, schemas, and status declarations together;
4. make no live behavior or database changes yet.
