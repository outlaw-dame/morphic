# AI Architecture Integration Phases

This document turns the AI architecture doctrine into an implementation sequence for Morphic. It also defines when the architecture should remain inside Morphic and when it should be extracted into a reusable monorepo/library.

Companion documents:

- [AI Research Architecture](./AI_ARCHITECTURE.md)
- [AI Architecture Gap Audit](./AI_ARCHITECTURE_GAP_AUDIT.md)
- [AI Role Prompts](./AI_ROLE_PROMPTS.md)

## Purpose

The architecture is broad enough to become a reusable evidence-native research library, but it should not be extracted too early. Morphic should first prove the interfaces through one working integration path.

The correct strategy is:

```text
Implement inside Morphic behind clean module boundaries.
Stabilize schemas, prompts, evals, and traces.
Extract into a monorepo/library only after the architecture works end-to-end.
```

## Integration principles

1. Safety hardening comes before deeper crawling or orchestration.
2. Schemas come before model prompts.
3. Deterministic policy comes before model judgment wherever possible.
4. Source quality and evidence roles must be represented before the Composer is upgraded.
5. Router, Coordinator, Fusion, Advisor, and Citation Verifier should be separate roles even if a deployment reuses the same underlying model.
6. OpenRouter Fusion/Advisor are optional accelerators, not the architecture.
7. Evals must cover architecture behavior, not only final answer text.
8. Library extraction should happen only when package boundaries are proven by Morphic integration.

## Phase AI-0: Baseline and safety inventory

Goal: confirm the current system state before changing behavior.

Tasks:

- Audit current chat streaming, researcher, search, fetch, feed, fact-check, source-preference, and knowledge-graph flows.
- Identify all places where search results, fetched pages, feed entries, fact-check results, and subtask notes enter the answer path.
- Identify all current tool schemas and UI stream metadata dependencies.
- Confirm current test coverage and gaps.
- Produce a short implementation baseline note before coding.

Exit criteria:

- Clear map of current request flow.
- Confirmed list of integration points.
- No behavior changes yet.

## Phase AI-1: Retrieval and crawling safety hardening

Goal: make retrieval safe before adding deeper research behavior.

Tasks:

- Ensure advanced search and result crawling use the same outbound URL validation posture as the safe fetch path.
- Add redirect validation.
- Add response-size caps.
- Add timeout controls.
- Add safe cache-key handling.
- Remove or replace serverless-hostile cleanup loops.
- Ensure fetched content is always treated as untrusted evidence.

Exit criteria:

- Advanced search cannot bypass SSRF protections.
- Fetched content size is bounded.
- Redirects are validated.
- Tests cover private IP, local network, redirect, timeout, and oversized-body cases.

Monorepo status: not yet. This phase is Morphic-specific safety debt.

## Phase AI-2: Shared schemas and evidence contracts

Goal: introduce the stable types that all later phases use.

Tasks:

- Add shared TypeScript/Zod schemas for:
  - `ResearchMode`;
  - `RiskLevel`;
  - `SourceClass`;
  - `EvidenceRole`;
  - `ClaimType`;
  - `RoutePlan`;
  - `CoordinatorDecision`;
  - `FusionPath`;
  - `SourceQualityAssessment`;
  - `ResolvedEntity`;
  - `EvidenceItem`;
  - `AtomicClaim`;
  - `AdvisorFinding`;
  - `CitationVerificationResult`;
  - `ResearchTrace`.
- Keep schemas in one internal namespace so they can later move to a package cleanly.

Recommended initial path:

```text
lib/ai-architecture/schemas/
  route.ts
  source.ts
  evidence.ts
  entity.ts
  advisor.ts
  verification.ts
  trace.ts
  index.ts
```

Exit criteria:

- Schemas compile.
- Unit tests validate representative valid/invalid objects.
- Existing code can import schemas without circular dependencies.

Monorepo status: not yet, but this is the first extraction candidate.

## Phase AI-2A: Model capability registry

Goal: prevent role prompts from being sent to models that cannot satisfy the role.

Tasks:

- Add a model capability schema.
- Record declared, inferred, manual, and unknown capability confidence.
- Represent capabilities including chat, streaming, tool calling, structured outputs, JSON mode, long context, reasoning, vision, local/remote, latency class, and cost class.
- Add role fallback policy.
- Enforce model capability checks before invoking Router, Coordinator, Fusion Planner, Composer, Advisor, Verifier, or Repair Agent.

Recommended path:

```text
lib/models/capabilities/
  capability-schema.ts
  provider-capabilities.ts
  model-role-selection.ts
  role-fallback-policy.ts
```

Exit criteria:

- Non-tool-capable models cannot be selected for tool-calling roles.
- Non-structured-output models cannot be selected for strict JSON roles unless a safe JSON fallback exists.
- Tests cover fallback and failure behavior.

Monorepo status: not yet. This is reusable but should first align with Morphic's provider registry.

## Phase AI-3: Built-in role prompts and prompt governance

Goal: move role prompts from documentation into versioned, non-user-facing code.

Tasks:

- Add built-in prompts for:
  - Router;
  - Coordinator;
  - Fusion Planner;
  - Source Quality Classifier;
  - Entity Grounding Assistant;
  - Answer Composer;
  - Advisor;
  - Citation Verifier;
  - Repair Agent.
- Add prompt version metadata.
- Ensure local/deployment overrides cannot weaken source, citation, privacy, or safety rules.
- Add retrieved-content safety doctrine to retrieval-fed roles.

Recommended path:

```text
lib/agents/prompts/roles/
  router.ts
  coordinator.ts
  fusion-planner.ts
  source-quality.ts
  entity-grounding.ts
  answer-composer.ts
  advisor.ts
  citation-verifier.ts
  repairer.ts
  prompt-version.ts
```

Exit criteria:

- Prompts are exported as versioned constants/builders.
- Tests assert prompt governance invariants are present.
- Existing user personalization cannot override role instructions.

Monorepo status: not yet. Prompt formats may change during initial integration.

## Phase AI-4: Router implementation

Goal: replace prompt-only orchestration with a typed route plan.

Tasks:

- Add Router module.
- Validate Router output with `RoutePlan` schema.
- Add deterministic fallback route policy if Router fails.
- Route high-stakes queries to critical mode.
- Route entity-sensitive queries to entity grounding.
- Route source-quality-sensitive queries to Fusion and Advisor.

Recommended path:

```text
lib/agents/router/
  route-query.ts
  route-schema.ts
  route-policy.ts
  model-assignment.ts
```

Exit criteria:

- Chat path can produce and log a valid `RoutePlan` before researcher execution.
- Router failures degrade to safe fallback behavior.
- Router evals cover low/medium/high/critical routes.

Monorepo status: not yet. Router should prove itself against Morphic traffic first.

## Phase AI-5: Source Quality Engine

Goal: score evidence before it reaches answer composition.

Tasks:

- Add source taxonomy.
- Add source registry support.
- Add page-level quality scoring.
- Add claim-evidence matrix.
- Add influence caps.
- Add forum/Reddit/social policy.
- Add content-farm, scraper, AI-slop, and poisoning-risk signals.
- Keep user source preferences separate from factual source quality.

Recommended path:

```text
lib/sources/quality/
  source-taxonomy.ts
  classify-source.ts
  classify-evidence-role.ts
  score-source-quality.ts
  page-quality.ts
  source-influence-caps.ts
  claim-evidence-matrix.ts
  corroboration.ts
  ai-slop-signals.ts
  poisoning-signals.ts
  forum-policy.ts
  registries/
    source-registry.ts
    default-source-registry.ts
    source-registry-schema.ts
    source-registry-policy.ts
```

Exit criteria:

- Every retrieved result can be converted into a source-quality assessment.
- Reddit/forum/social sources receive claim-appropriate caps.
- Content farms/scrapers are downweighted.
- User source preferences modify discovery/ranking without becoming truth.

Monorepo status: candidate package after this phase stabilizes.

## Phase AI-6: Entity Grounding Engine

Goal: prevent entity confusion and attach canonical entity context.

Tasks:

- Split lightweight knowledge-graph enrichment into dedicated entity modules.
- Add entity extraction.
- Add Wikidata client.
- Add DBpedia client.
- Add entity resolution and confidence scoring.
- Add ambiguity flags for similarly named people, companies, products, places, and events.

Recommended path:

```text
lib/entities/
  entity-extraction.ts
  entity-resolution.ts
  wikidata-client.ts
  dbpedia-client.ts
  entity-grounding.ts
  entity-confidence.ts
```

Exit criteria:

- Query entities and evidence entities can be resolved into `ResolvedEntity[]`.
- Ambiguous entities are surfaced to Coordinator.
- Knowledge graph facts do not override fresher primary sources for current claims.

Monorepo status: candidate package after Morphic-specific search result integration is stable.

## Phase AI-7: Evidence Graph and evidence normalization

Goal: stop passing raw snippets and prose notes as the main substrate.

Tasks:

- Convert search, feed, fetch, fact-check, and entity outputs into `EvidenceItem[]`.
- Extract or attach atomic claims where possible.
- Deduplicate canonical URLs.
- Cluster repeated claims.
- Detect copied/duplicated sources.
- Attach source quality and entity grounding to evidence items.

Recommended path:

```text
lib/ai-architecture/evidence/
  normalize-search-result.ts
  normalize-fetch-result.ts
  normalize-feed-result.ts
  normalize-factcheck-result.ts
  evidence-dedupe.ts
  claim-extraction.ts
  claim-clustering.ts
  contradiction-detection.ts
```

Exit criteria:

- Answer path can consume structured evidence items.
- Subtask notes no longer act as opaque truth blobs.
- Duplicates and content laundering are not counted as independent corroboration.

Monorepo status: strong candidate package once this works end-to-end.

## Phase AI-8: Coordinator implementation

Goal: supervise execution before composition.

Tasks:

- Add execution state object.
- Add Coordinator decision module.
- Add escalation policy.
- Add repair policy.
- Add source-mix checks.
- Add entity-grounding adequacy checks.
- Add evidence freshness checks.
- Add contradiction checks.

Recommended path:

```text
lib/agents/coordinator/
  coordinator.ts
  execution-state.ts
  escalation-policy.ts
  source-mix-policy.ts
  freshness-policy.ts
  repair-policy.ts
```

Exit criteria:

- Coordinator can block composition when source mix is inadequate.
- Coordinator can request more retrieval or stronger model usage.
- Coordinator can require Advisor/Citation Verifier for high-risk routes.

Monorepo status: not yet. Coordinator should stabilize with Morphic's streaming/tool loop first.

## Phase AI-9: Provider-agnostic Fusion

Goal: run independent evidence paths without depending on OpenRouter server tools.

Tasks:

- Add Fusion path planner integration.
- Add path execution interface.
- Run independent path searches.
- Normalize results into evidence items.
- Compare consensus and contradictions.
- Preserve optional OpenRouter Fusion as an accelerator only.

Recommended path:

```text
lib/agents/fusion/
  create-fusion-plan.ts
  run-fusion-paths.ts
  normalize-evidence.ts
  cluster-evidence.ts
  detect-contradictions.ts
  openrouter-fusion-adapter.ts
```

Exit criteria:

- Fusion works without OpenRouter.
- OpenRouter Fusion can be used only when configured and valid.
- Fusion outputs structured evidence, not prose summaries.

Monorepo status: candidate package after source-quality and evidence schemas are stable.

## Phase AI-10: Answer Composer integration

Goal: make the composer evidence-first.

Tasks:

- Update researcher/composer instructions to consume evidence graph and route plan.
- Prevent composition from raw snippets alone on adaptive/deep/critical paths.
- Enforce citation requirements from route plan.
- Use source-quality influence caps in composition.
- Clearly label weak or community evidence.

Exit criteria:

- Composer does not cite unsupported evidence.
- Composer distinguishes confirmed facts from reports and user experiences.
- Forum/social evidence is phrased correctly.

Monorepo status: Composer may remain app-specific longer because final answer UX and citation rendering are Morphic-specific.

## Phase AI-11: Provider-agnostic Advisor

Goal: critique drafts before they reach the user.

Tasks:

- Add Advisor module.
- Add Advisor finding schema validation.
- Add source-quality review.
- Add contradiction review.
- Add entity-confusion review.
- Add OpenRouter Advisor as optional adapter only.

Recommended path:

```text
lib/agents/advisor/
  review-draft.ts
  advisor-findings.ts
  advisor-policy.ts
  openrouter-advisor-adapter.ts
```

Exit criteria:

- Advisor catches unsupported claims, weak-source overuse, bad citations, stale evidence, and ignored contradictions.
- Advisor can run with ordinary providers, not only OpenRouter.

Monorepo status: candidate package after Citation Verifier and Repair Agent are integrated.

## Phase AI-12: Citation Verifier and Repair Agent

Goal: verify claim-level support and repair unsafe/unsupported output.

Tasks:

- Extract claims from draft answers.
- Map claims to evidence IDs.
- Verify cited evidence supports claim wording.
- Assign supported/partially supported/unsupported/contradicted verdicts.
- Repair unsupported, overbroad, stale, or weakly cited claims.

Recommended path:

```text
lib/answers/verification/
  extract-claims.ts
  map-claims-to-evidence.ts
  verify-citations.ts
  repair-unsupported-claims.ts
  repair-answer.ts
```

Exit criteria:

- Unsupported high-stakes claims cannot pass final verification.
- Bad citations are repaired or removed.
- Repair Agent does not add new facts or sources.

Monorepo status: strong candidate package after evals demonstrate reliability.

## Phase AI-13: Research trace and observability

Goal: make the architecture auditable without exposing private chain-of-thought.

Tasks:

- Add `ResearchTrace` generation.
- Log route plan, coordinator decisions, Fusion paths, source-quality summaries, entity summaries, advisor findings, verifier results, and repair status.
- Avoid logging secrets, raw private prompts, chain-of-thought, or unnecessary sensitive fetched content.
- Integrate with existing tracing/telemetry carefully.

Exit criteria:

- Developers can debug why an answer used a path/source/caveat.
- Traces show structured decisions, not private reasoning prose.

Monorepo status: keep Morphic-specific telemetry adapters separate from reusable trace schema.

## Phase AI-14: Architecture behavior evals

Goal: test the system architecture, not only final answer quality.

Tasks:

- Add Router evals.
- Add source-quality evals.
- Add source influence cap evals.
- Add entity disambiguation evals.
- Add poisoning-resistance evals.
- Add Advisor and Citation Verifier evals.
- Add latency and budget evals.

Recommended path:

```text
evals/ai-architecture/
  router/
  source-quality/
  entity-grounding/
  fusion/
  advisor/
  citation-verifier/
  poisoning-resistance/
```

Exit criteria:

- Evals fail when Reddit/forum evidence dominates high-stakes facts.
- Evals fail when content farms are treated as primary authority.
- Evals fail when unsupported citations pass.
- Evals fail when entity confusion is not detected.

Monorepo status: evals should be created before extraction. They become the safety net for extraction.

## Phase AI-15: Morphic integration stabilization

Goal: prove the architecture works in real Morphic flows.

Tasks:

- Run architecture in shadow mode for selected routes.
- Compare old researcher output vs evidence-native path.
- Measure latency, cost, failure modes, and answer quality.
- Roll out by mode: quick shadow, adaptive gated, deep/critical gated.
- Keep feature flags for rollback.

Exit criteria:

- Adaptive mode can use the architecture without breaking UX.
- Critical mode has strict source/citation behavior.
- Evals and unit tests pass.
- Traces are useful for debugging.
- No major regressions in latency or stability.

Monorepo status: prepare extraction only after this phase.

## Phase AI-16: Internal package boundary inside Morphic

Goal: create a package-like boundary without moving to a separate repo yet.

Tasks:

- Consolidate reusable architecture modules under one namespace.
- Remove Morphic-specific imports from reusable modules.
- Define adapter interfaces for:
  - model invocation;
  - search;
  - fetch;
  - entity lookup;
  - telemetry;
  - citation rendering;
  - persistence.
- Keep Morphic-specific glue in adapters.

Recommended path:

```text
lib/ai-research/
  core/
  router/
  coordinator/
  fusion/
  source-quality/
  entities/
  evidence/
  advisor/
  verifier/
  prompts/
  evals/
  adapters/
    morphic/
```

Exit criteria:

- Reusable modules do not depend on Next.js request/response objects.
- Reusable modules do not depend directly on Morphic UI or database code.
- Adapters contain Morphic-specific dependencies.
- Tests can run architecture modules independently.

Monorepo status: this is the extraction rehearsal.

## Phase AI-17: Monorepo/library extraction decision

Goal: decide whether to create a dedicated monorepo/library.

Create the monorepo/library only if all of these are true:

- Router, Coordinator, Source Quality, Entity Grounding, Evidence Graph, Fusion, Advisor, Citation Verifier, and Repair Agent work in Morphic.
- Shared schemas have stabilized for at least one complete integration cycle.
- Evals cover Router, source quality, entity grounding, Fusion, Advisor, Citation Verifier, poisoning resistance, and citation integrity.
- Reusable modules no longer depend directly on Morphic-specific app code.
- There is a clear second consumer or future consumer, such as another app, local-first client, enterprise research workflow, browser/search client, or standalone eval runner.
- Package boundaries are clear enough that extraction reduces complexity rather than increasing it.

Do not create the library if:

- schemas are still changing every phase;
- Morphic-specific assumptions are still embedded in core modules;
- evals are not in place;
- the package would become abstraction without a stable consumer;
- extraction would slow down safety-critical fixes.

Recommended decision result:

```text
If Phase AI-16 succeeds and Phase AI-17 conditions are met:
  create a dedicated monorepo.

Otherwise:
  keep the architecture inside Morphic as an internal package boundary.
```

## Phase AI-18: Monorepo/library creation

Goal: extract the architecture into a reusable workspace after the integration proves it.

Recommended repo name options:

```text
outlaw-dame/ai-research-architecture
outlaw-dame/evidence-engine
outlaw-dame/enki-research-core
```

Recommended package namespace options:

```text
@enki-ai/research-core
@enki-ai/evidence-engine
@enki/research-core
```

Recommended monorepo layout:

```text
packages/
  core/
  router/
  coordinator/
  fusion/
  source-quality/
  entities/
  evidence/
  advisor/
  verifier/
  prompts/
  evals/
  adapters-ai-sdk/
  adapters-search/
apps/
  morphic-integration-demo/
  eval-runner/
docs/
```

Suggested package responsibilities:

```text
packages/core:
  shared types, schemas, result objects, errors

packages/prompts:
  versioned built-in role prompts

packages/router:
  route planning and model-role assignment

packages/coordinator:
  execution state, coordinator decisions, escalation and repair policy

packages/fusion:
  FusionPath planning, path execution contracts, evidence normalization

packages/source-quality:
  source taxonomy, registry, page quality, AI-slop signals, influence caps

packages/entities:
  entity extraction/resolution, Wikidata/DBpedia adapters, confidence scoring

packages/evidence:
  EvidenceItem, AtomicClaim, dedupe, claim clustering, contradiction detection

packages/advisor:
  advisor findings and review policy

packages/verifier:
  claim extraction, citation support checking, repair instructions

packages/evals:
  architecture behavior fixtures and eval runner

packages/adapters-ai-sdk:
  Vercel AI SDK integration

packages/adapters-search:
  search/fetch/feed provider interfaces and adapters
```

Morphic should then depend on the library through adapters, not by owning all core logic directly.

Target import shape:

```ts
import {
  createResearchRouter,
  createCoordinator,
  createFusionEngine,
  createSourceQualityEngine,
  createEntityGrounder,
  createAdvisor,
  createCitationVerifier,
} from '@enki-ai/research-core'
```

Exit criteria:

- Monorepo packages build independently.
- Morphic consumes the packages through stable adapters.
- Evals run in the monorepo and can be reused by Morphic CI.
- The package can support a second consumer without importing Morphic app code.

## What stays Morphic-specific

Morphic should keep:

- UI and generative UI rendering;
- auth/session handling;
- chat persistence;
- share-page policy;
- personalization UI;
- provider API key handling;
- search provider environment configuration;
- Langfuse/project telemetry wiring;
- rate limits;
- deployment settings;
- citation rendering details.

## What belongs in the reusable library

The reusable library should own:

- role schemas;
- route plans;
- coordinator decisions;
- Fusion path contracts;
- source taxonomy;
- source quality scoring;
- source registries;
- influence caps;
- entity grounding interfaces;
- evidence graph;
- role prompts;
- advisor findings;
- citation verification;
- repair instructions;
- architecture eval fixtures.

## Final recommendation

Create the monorepo/library, but only after Morphic proves the architecture in production-like flows.

Until then, treat Morphic as the proving ground and keep the code structured as if it will become a library. This gives us the best of both paths: fast iteration now, clean extraction later.
