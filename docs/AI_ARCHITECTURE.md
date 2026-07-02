# AI Research Architecture

This document defines the target architecture for Morphic's AI search and answer system. It is intentionally provider-agnostic. OpenRouter Fusion/Advisor can be used as optional accelerators, but Morphic's accuracy architecture must not depend on OpenRouter-only server tools.

The goal is to evolve Morphic from "LLM + search results + citations" into a router-led, coordinator-supervised, evidence-native answer engine.

Companion documents:

- [AI Architecture Gap Audit](./AI_ARCHITECTURE_GAP_AUDIT.md)
- [AI Role Prompts](./AI_ROLE_PROMPTS.md)
- [AI Architecture Integration Phases](./AI_ARCHITECTURE_INTEGRATION_PHASES.md)

## Goals

Morphic should optimize for:

- factual accuracy over fluent answer generation;
- source quality over raw result count;
- claim-level evidence over generic citations;
- provider portability across OpenAI, Anthropic, Google, Mistral, Vercel AI Gateway, OpenAI-compatible providers, OpenRouter, Ollama, Ollama Cloud, NVIDIA, and future providers;
- lightweight routing where possible and stronger verification where necessary;
- clear separation between user preferences and factual source quality;
- safe retrieval, bounded crawling, SSRF protection, and privacy-preserving telemetry.

## Non-goals

Morphic should not:

- treat all websites as equal evidence;
- treat Reddit, forums, or social media as authoritative for high-stakes factual claims;
- rely on one model to plan, retrieve, judge, compose, and verify without checks;
- make OpenRouter beta server tools mandatory for high-quality research;
- allow user personalization to override source, safety, citation, privacy, or security doctrine;
- cite sources that do not actually support the associated claim.

## Current architecture summary

The current chat path is broadly:

```text
Chat route
  -> auth, rate limits, search mode, model selection
  -> streaming response creator
  -> researcher ToolLoopAgent
  -> tools: search, fetch, feedSearch, mapSearch, factCheck, sourcePreferences,
            todoWrite, researchSubtask
  -> streamed answer
```

This is better than a single one-shot model answer, but much of the orchestration still depends on prompts inside one main agent. The target architecture should move strategic decisions into deterministic controller modules and bounded role-specific prompts.

## Target architecture

```text
User query
  -> Router
  -> Coordinator
  -> Fusion retrieval paths
  -> Source Quality Engine
  -> Entity Grounding Engine
  -> Evidence Graph
  -> Answer Composer
  -> Advisor
  -> Claim/Citation Verifier
  -> Final answer
```

### Architectural roles

| Role | Purpose | Should answer user? | Preferred model type |
| --- | --- | --- | --- |
| Router | Classify the request, risk, source needs, mode, budgets, and model-role assignments. | No | Lightweight, fast, structured-output capable |
| Coordinator | Conduct the process, enforce architecture, decide escalation/repair, and ensure source mix is acceptable. | No | Accurate instruction-tuned model or strong structured controller |
| Planner | Convert the route into concrete retrieval paths. May be merged into Coordinator for small deployments. | No | Reasoning-capable, structured-output capable |
| Fusion Engine | Run independent evidence paths and normalize results. | No | Mostly deterministic; may use small models for query expansion |
| Source Quality Engine | Classify and score sources by class, topical authority, evidence role, freshness, corroboration, and spam risk. | No | Hybrid rules + lightweight classifier |
| Entity Grounding Engine | Resolve entities through Wikidata, DBpedia, and retrieved evidence; prevent entity confusion. | No | Hybrid rules + bounded LLM extraction when useful |
| Answer Composer | Write the answer from structured evidence only. | Yes | Strong instruction-following model |
| Advisor | Critique the draft against evidence, source quality, contradictions, and citations. | No | Strong verifier; ideally different model family from composer when available |
| Citation Verifier | Check claim-level support and repair or remove unsupported claims. | No | Deterministic checks + NLI/verifier model where available |

Router, Coordinator, Fusion, Advisor, and Verifier are separate roles. A deployment may use the same underlying model for more than one role, but the architecture should keep the responsibilities separate.

## Router

The Router is the first model/controller in the chain. It must be lightweight but intelligent enough to understand Morphic's architecture.

The Router does not answer the user. It emits strict JSON matching the route schema.

### Router responsibilities

The Router decides:

- whether the query requires live search;
- whether the query is simple, adaptive, deep, or critical;
- whether the topic is high-stakes;
- whether entity grounding is required;
- whether source quality constraints are required;
- whether provider-agnostic Fusion is required;
- whether Advisor and citation verification are required;
- which source classes are allowed, preferred, discouraged, or capped;
- which model role should be used for planning, composing, advising, and verification;
- latency, source, and tool budgets.

### Route schema

```ts
type ResearchMode = 'quick' | 'adaptive' | 'deep' | 'critical'
type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

type SourceClass =
  | 'official_source'
  | 'government_or_regulator'
  | 'standards_body'
  | 'academic_or_peer_reviewed'
  | 'primary_data_source'
  | 'court_or_legal_record'
  | 'established_news'
  | 'specialist_publication'
  | 'company_or_vendor'
  | 'independent_blog'
  | 'forum_or_reddit'
  | 'social_media'
  | 'wiki_or_knowledge_graph'
  | 'content_farm'
  | 'scraper_or_aggregator'
  | 'unknown'

type ModelRole = {
  role: 'router' | 'coordinator' | 'planner' | 'retrieval' | 'composer' | 'advisor' | 'verifier'
  requiredCapabilities: Array<
    | 'chat'
    | 'streaming'
    | 'toolCalling'
    | 'structuredOutputs'
    | 'longContext'
    | 'reasoning'
    | 'lowLatency'
  >
  preferredStrength: 'lightweight' | 'balanced' | 'strong' | 'strongest_available'
  allowLocal: boolean
}

type RoutePlan = {
  mode: ResearchMode
  riskLevel: RiskLevel
  requiresSearch: boolean
  requiresFreshness: boolean
  requiresFusion: boolean
  requiresEntityGrounding: boolean
  requiresSourceQualityScoring: boolean
  requiresAdvisor: boolean
  requiresCitationVerification: boolean
  allowedSourceClasses: SourceClass[]
  preferredSourceClasses: SourceClass[]
  discouragedSourceClasses: SourceClass[]
  cappedSourceClasses: Array<{
    sourceClass: SourceClass
    maxInfluence: number
    reason: string
  }>
  modelAssignments: {
    coordinator?: ModelRole
    planner?: ModelRole
    retrieval?: ModelRole
    composer: ModelRole
    advisor?: ModelRole
    verifier?: ModelRole
  }
  budget: {
    maxToolCalls: number
    maxSources: number
    maxFusionPaths: number
    targetLatencyMs?: number
  }
  routingRationale: string
}
```

### Example route

```json
{
  "mode": "critical",
  "riskLevel": "high",
  "requiresSearch": true,
  "requiresFreshness": true,
  "requiresFusion": true,
  "requiresEntityGrounding": true,
  "requiresSourceQualityScoring": true,
  "requiresAdvisor": true,
  "requiresCitationVerification": true,
  "allowedSourceClasses": [
    "government_or_regulator",
    "academic_or_peer_reviewed",
    "established_news",
    "specialist_publication",
    "wiki_or_knowledge_graph",
    "forum_or_reddit"
  ],
  "preferredSourceClasses": [
    "government_or_regulator",
    "academic_or_peer_reviewed",
    "specialist_publication"
  ],
  "discouragedSourceClasses": [
    "content_farm",
    "scraper_or_aggregator",
    "unknown"
  ],
  "cappedSourceClasses": [
    {
      "sourceClass": "forum_or_reddit",
      "maxInfluence": 0.2,
      "reason": "Useful for user experience and emerging reports, not authoritative for high-stakes factual claims."
    }
  ],
  "modelAssignments": {
    "coordinator": {
      "role": "coordinator",
      "requiredCapabilities": ["chat", "structuredOutputs", "reasoning"],
      "preferredStrength": "strong",
      "allowLocal": false
    },
    "composer": {
      "role": "composer",
      "requiredCapabilities": ["chat", "streaming", "toolCalling"],
      "preferredStrength": "strong",
      "allowLocal": true
    },
    "advisor": {
      "role": "advisor",
      "requiredCapabilities": ["chat", "structuredOutputs", "reasoning"],
      "preferredStrength": "strongest_available",
      "allowLocal": true
    },
    "verifier": {
      "role": "verifier",
      "requiredCapabilities": ["chat", "structuredOutputs"],
      "preferredStrength": "balanced",
      "allowLocal": true
    }
  },
  "budget": {
    "maxToolCalls": 40,
    "maxSources": 16,
    "maxFusionPaths": 5,
    "targetLatencyMs": 45000
  },
  "routingRationale": "High-stakes factual question with likely entity ambiguity and poisoning risk; requires diverse high-quality evidence and verification."
}
```

## Coordinator

The Coordinator is the conductor. It supervises execution but does not rewrite facts or answer the user directly.

### Coordinator responsibilities

The Coordinator checks:

- whether the Router chose an appropriate route;
- whether the Fusion paths are diverse enough;
- whether the source mix satisfies the route;
- whether weak sources are overrepresented;
- whether Reddit/forums/social sources are being used only within their allowed evidence role;
- whether entity grounding resolved the correct entities;
- whether contradictions are unresolved;
- whether the answer should escalate to a stronger model;
- whether more retrieval is needed before composition;
- whether Advisor or Citation Verifier findings require repair.

The Coordinator should emit structured decisions such as:

```ts
type CoordinatorDecision = {
  status:
    | 'continue'
    | 'need_more_retrieval'
    | 'escalate_model'
    | 'compose_answer'
    | 'repair_answer'
    | 'refuse_or_caveat'
  reasons: string[]
  requiredActions: Array<{
    action:
      | 'add_primary_source_path'
      | 'add_recent_news_path'
      | 'add_entity_grounding'
      | 'downweight_source_class'
      | 'run_advisor'
      | 'run_citation_verifier'
      | 'repair_unsupported_claims'
    details: string
  }>
}
```

## Provider-agnostic Fusion

Fusion is not a provider feature. It is Morphic's internal evidence strategy.

OpenRouter Fusion may be used when enabled and available, but Morphic's own Fusion Engine must exist independently.

### Fusion doctrine

Fusion means:

1. create multiple independent evidence paths;
2. run them separately;
3. normalize evidence into structured objects;
4. dedupe and canonicalize sources;
5. cluster claims;
6. compare consensus and contradictions;
7. pass structured evidence to the composer.

### Fusion path schema

```ts
type FusionPath = {
  id: string
  purpose:
    | 'official'
    | 'government-regulatory'
    | 'academic'
    | 'standards'
    | 'news'
    | 'specialist-reporting'
    | 'independent-review'
    | 'forum-experience'
    | 'fact-check'
    | 'entity-knowledge-graph'
    | 'local-map'
    | 'feed'
  query: string
  requiredFreshness?: 'any' | 'today' | 'last-7-days' | 'last-30-days' | 'last-year'
  includeDomains?: string[]
  excludeDomains?: string[]
  preferredSourceClasses?: SourceClass[]
  maxResults: number
}
```

### Fusion examples

A product trustworthiness query might run:

```text
1. official/vendor path
2. independent reviews path
3. regulatory/consumer complaint path
4. forum/reddit experience path with capped influence
5. news/specialist reporting path
```

A health query might run:

```text
1. government/medical authority path
2. academic literature path
3. regulatory warning path
4. forum/user-experience path with very low influence cap
```

A software/API query might run:

```text
1. official docs path
2. GitHub issue/changelog path
3. standards/spec path
4. forum/workaround path with capped influence
```

## Provider-agnostic Advisor

Advisor is a post-composition critic. It is not an OpenRouter-only feature.

OpenRouter Advisor may be used when explicitly enabled, but Morphic should have its own default Advisor pipeline.

### Advisor responsibilities

The Advisor reviews the draft for:

- unsupported claims;
- citation mismatch;
- missing source diversity;
- stale evidence;
- ignored contradictions;
- entity confusion;
- overconfident language;
- weak source overuse;
- Reddit/forum/social evidence used outside its allowed role;
- user source preferences overriding factual quality;
- safety/privacy/security rule violations.

### Advisor finding schema

```ts
type AdvisorFinding = {
  severity: 'blocker' | 'warning' | 'note'
  issue:
    | 'unsupported_claim'
    | 'bad_citation'
    | 'missing_source_diversity'
    | 'stale_evidence'
    | 'ignored_contradiction'
    | 'entity_confusion'
    | 'overconfident_language'
    | 'weak_source_overuse'
    | 'source_preference_violation'
    | 'safety_or_privacy_violation'
  claim?: string
  evidenceIds?: string[]
  repairInstruction: string
}
```

## Source Quality Engine

Morphic must not treat every website as equivalent. Source quality is contextual and claim-specific.

### Source quality doctrine

A source is not trusted globally. A source is trusted for a specific kind of claim, in a specific domain, with a specific evidence role, under a specific confidence level.

Forums and Reddit can be useful for human experience, sentiment, complaints, emerging issues, and practical workarounds. They must not receive authoritative weight for factual, high-stakes, legal, medical, financial, scientific, political, death/injury, or safety claims unless corroborated by stronger source classes.

### Source classification

```ts
type SourceClass =
  | 'official_source'
  | 'government_or_regulator'
  | 'standards_body'
  | 'academic_or_peer_reviewed'
  | 'primary_data_source'
  | 'court_or_legal_record'
  | 'established_news'
  | 'specialist_publication'
  | 'company_or_vendor'
  | 'independent_blog'
  | 'forum_or_reddit'
  | 'social_media'
  | 'wiki_or_knowledge_graph'
  | 'content_farm'
  | 'scraper_or_aggregator'
  | 'unknown'
```

### Evidence roles

```ts
type EvidenceRole =
  | 'primary_authority'
  | 'official_claim'
  | 'regulatory_or_legal_record'
  | 'peer_reviewed_or_academic'
  | 'expert_analysis'
  | 'original_reporting'
  | 'independent_review'
  | 'firsthand_experience'
  | 'community_signal'
  | 'background_context'
  | 'rumor_or_unverified'
  | 'unsafe_for_factual_claim'
```

### Source quality score

```ts
type SourceQualityAssessment = {
  sourceClass: SourceClass
  evidenceRole: EvidenceRole
  topicalAuthorityScore: number
  factualReliabilityScore: number
  freshnessScore: number
  originalityScore: number
  transparencyScore: number
  corroborationScore: number
  conflictOfInterestPenalty: number
  spamRiskScore: number
  aiSlopRiskScore: number
  finalWeight: number
  influenceCap: number
  requiresCorroboration: boolean
  allowedClaimTypes: ClaimType[]
  disallowedClaimTypes: ClaimType[]
  rationale: string
}
```

### Quality scoring principles

Source quality should account for:

- source class;
- topical authority;
- evidence role;
- originality;
- author/editor transparency;
- date and freshness;
- primary-source links;
- corroboration by independent sources;
- conflict of interest;
- content-farm or scraper signals;
- AI-slop patterns;
- domain reputation and known source policy;
- user source preferences as a modifier, not as truth.

### Influence caps

Weak or community sources should be capped so they cannot dominate an answer.

```text
High-stakes medical/legal/financial/political/safety claim:
  Reddit/forum/social max influence: 0.10-0.20 and requires corroboration.

Product experience or usability claim:
  Reddit/forum max influence: 0.35-0.50 when multiple independent reports agree.

Community sentiment question:
  Reddit/forum max influence: 0.60-0.75 because the question is explicitly about community experience.

Authoritative factual claim:
  Requires primary, official, academic, regulatory, legal, standards, or established/specialist reporting evidence.
```

### Forums and Reddit policy

Reddit and forums can support:

- lived experience;
- community sentiment;
- recurring complaints;
- product failure patterns;
- workarounds;
- early signals that require corroboration.

Reddit and forums must not independently establish:

- medical facts;
- legal conclusions;
- election or political facts;
- scientific consensus;
- death, injury, or safety claims;
- financial claims;
- company ownership;
- verified breaking news;
- accusations of wrongdoing.

Use wording such as "users report," "some posters describe," or "community complaints suggest" when using forum evidence. Do not convert forum evidence into confirmed fact unless corroborated by stronger sources.

## User source preferences vs factual quality

Morphic already supports user source preferences such as trust, prefer, mute, and block. This is important for personalization and user control, but it must remain separate from factual quality.

```text
User preference:
  "I like or dislike this source."

Factual quality:
  "This source is or is not strong evidence for this claim."
```

A user-trusted source may be boosted for discovery, but it should not become authoritative for claims outside its domain or evidence role. A blocked source should be removed for that user, but blocking a source does not make competing sources more factual.

## Entity Grounding Engine

Morphic already has lightweight Wikidata and DBpedia enrichment. The target architecture promotes this into a true Entity Grounding Engine.

### Entity grounding responsibilities

The Entity Grounding Engine should:

- extract candidate entities from the query and evidence;
- resolve entities to canonical IDs where possible;
- use Wikidata and DBpedia for disambiguation and background facts;
- attach aliases, entity types, parent organizations, locations, dates, and relationships;
- detect entity ambiguity;
- compare knowledge-graph facts with current web evidence;
- prevent answers that mix up similarly named people, companies, places, or products.

Knowledge graphs are not always current, so they should not override fresh primary reporting. They should be used for disambiguation, canonicalization, relationship checks, and consistency checks.

### Entity schema

```ts
type ResolvedEntity = {
  canonicalName: string
  entityType:
    | 'person'
    | 'organization'
    | 'product'
    | 'place'
    | 'event'
    | 'creative_work'
    | 'concept'
    | 'unknown'
  wikidataId?: string
  dbpediaUri?: string
  aliases: string[]
  confidence: number
  disambiguationNotes?: string[]
  supportingEvidenceIds: string[]
}
```

## Evidence Graph

The composer should not receive raw search snippets alone. It should receive structured evidence.

```ts
type EvidenceItem = {
  id: string
  url: string
  canonicalUrl: string
  title: string
  sourceName?: string
  sourceClass: SourceClass
  evidenceRole: EvidenceRole
  publishedAt?: string
  retrievedAt: string
  snippet: string
  extractedText?: string
  claims: AtomicClaim[]
  entities: ResolvedEntity[]
  quality: SourceQualityAssessment
  confidenceSignals: string[]
}

type AtomicClaim = {
  id: string
  text: string
  claimType:
    | 'definition'
    | 'current_fact'
    | 'historical_fact'
    | 'statistic'
    | 'causal_claim'
    | 'recommendation'
    | 'legal_claim'
    | 'medical_claim'
    | 'financial_claim'
    | 'safety_claim'
    | 'experience_report'
    | 'opinion'
  supportLevel: 'supports' | 'partially_supports' | 'contradicts' | 'not_enough_information'
  evidenceIds: string[]
}
```

## Answer Composer

The Answer Composer writes from structured evidence. It should not invent sources, overstate weak evidence, or use uncited claims when citation is required.

The Composer receives:

- original user query;
- route plan;
- evidence graph;
- source quality assessments;
- entity grounding results;
- consensus and contradiction notes;
- citation requirements;
- answer style constraints.

The Composer must:

- answer the user's question directly;
- cite factual claims with supporting evidence;
- distinguish confirmed facts from reports, allegations, opinions, and user experiences;
- use caveats when evidence is weak, stale, conflicting, or forum-based;
- avoid letting low-quality sources dominate;
- avoid citing sources that do not support the sentence.

## Claim and citation verification

Citation verification is mandatory for adaptive, deep, critical, and high-stakes routes.

The verifier should:

1. split the draft answer into atomic claims;
2. identify which claims require citation;
3. map each claim to evidence items;
4. check whether the cited evidence supports the claim;
5. detect unsupported, contradicted, stale, or overconfident claims;
6. return repair instructions;
7. remove or rewrite claims that cannot be supported.

```ts
type CitationVerificationResult = {
  claimId: string
  claimText: string
  citedEvidenceIds: string[]
  verdict: 'supported' | 'partially_supported' | 'unsupported' | 'contradicted'
  severity: 'blocker' | 'warning' | 'note'
  repairInstruction?: string
}
```

## Mode behavior

### Quick mode

Use for low-risk, low-ambiguity queries.

```text
Router
  -> lightweight retrieval if needed
  -> source quality scoring
  -> composer
  -> lightweight citation check
```

Quick mode should still avoid unsupported claims and low-quality source dominance.

### Adaptive mode

Use for normal research and search answers.

```text
Router
  -> Coordinator
  -> Fusion when useful
  -> Source Quality Engine
  -> Entity Grounding when needed
  -> Composer
  -> Advisor when useful
  -> Citation Verifier
```

### Deep mode

Use for multi-part, ambiguous, conflicting, or high-value research.

```text
Router
  -> Coordinator
  -> multiple Fusion paths
  -> entity grounding
  -> contradiction detection
  -> strong composer
  -> strong Advisor
  -> citation verifier and repair pass
```

### Critical mode

Use for medical, legal, financial, political, safety, death/injury, public-figure, or other high-stakes queries.

```text
Router
  -> Coordinator
  -> required high-quality source classes
  -> capped forum/social influence
  -> entity grounding
  -> contradiction detection
  -> cautious composer
  -> Advisor
  -> strict citation verifier
  -> caveat/refuse if evidence is inadequate
```

## Implementation roadmap

The implementation sequence and monorepo/library extraction criteria are defined in [AI Architecture Integration Phases](./AI_ARCHITECTURE_INTEGRATION_PHASES.md). The summary below remains as the architectural roadmap.

### AI-1: Safety hardening

Before expanding crawling or deeper retrieval, advanced search must use the same outbound safety posture as the rest of the app:

- SSRF guard;
- redirect validation;
- response-size caps;
- timeout controls;
- safe cache-key handling;
- no serverless-hostile cleanup loops.

### AI-2: Router

Add:

```text
lib/agents/router/
  route-query.ts
  route-schema.ts
  route-policy.ts
  model-assignment.ts
```

### AI-3: Coordinator

Add:

```text
lib/agents/coordinator/
  coordinator.ts
  execution-state.ts
  escalation-policy.ts
  repair-policy.ts
```

### AI-4: Source Quality Engine

Add:

```text
lib/sources/quality/
  source-taxonomy.ts
  classify-source.ts
  classify-evidence-role.ts
  score-source-quality.ts
  source-influence-caps.ts
  corroboration.ts
  ai-slop-signals.ts
  forum-policy.ts
```

### AI-5: Entity Grounding Engine

Promote current knowledge graph enrichment into:

```text
lib/entities/
  entity-extraction.ts
  entity-resolution.ts
  wikidata-client.ts
  dbpedia-client.ts
  entity-grounding.ts
  entity-confidence.ts
```

### AI-6: Provider-agnostic Fusion

Add:

```text
lib/agents/fusion/
  create-fusion-plan.ts
  run-fusion-paths.ts
  normalize-evidence.ts
  cluster-evidence.ts
  detect-contradictions.ts
```

### AI-7: Provider-agnostic Advisor

Add:

```text
lib/agents/advisor/
  review-draft.ts
  advisor-findings.ts
  repair-answer.ts
```

### AI-8: Evidence-first answer generation

Replace prose subtask notes with structured evidence bundles. The Answer Composer should consume `EvidenceItem[]`, not opaque subagent summaries.

### AI-9: Claim/citation verifier

Add:

```text
lib/answers/verification/
  extract-claims.ts
  map-claims-to-evidence.ts
  verify-citations.ts
  repair-unsupported-claims.ts
```

### AI-10: Quality eval suite

Add evals for:

- factual accuracy;
- citation precision;
- source diversity;
- source-quality weighting;
- Reddit/forum poisoning resistance;
- entity disambiguation;
- high-stakes caution;
- conflicting-source handling;
- recency correctness;
- latency/tool budget.

## Required documentation companion

The built-in prompts for these internal roles are documented in [AI Role Prompts](./AI_ROLE_PROMPTS.md). Those prompts are non-user-facing system/developer prompts intended to be used by whichever provider/model Morphic assigns to each role.
