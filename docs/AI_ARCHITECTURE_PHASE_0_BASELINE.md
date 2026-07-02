# AI Architecture Phase 0 Baseline

This baseline records the current repo-grounded implementation state before Phase AI-1 changes begin. It should be used as the handoff for implementation work so the next PR changes behavior deliberately rather than guessing from the high-level architecture docs.

Companion documents:

- [AI Research Architecture](./AI_ARCHITECTURE.md)
- [AI Architecture Integration Phases](./AI_ARCHITECTURE_INTEGRATION_PHASES.md)
- [AI Architecture Gap Audit](./AI_ARCHITECTURE_GAP_AUDIT.md)
- [AI Role Prompts](./AI_ROLE_PROMPTS.md)
- [AI Architecture Schema Notes](./AI_ARCHITECTURE_SCHEMA_NOTES.md)

## Current request flow

The current chat request flow is:

```text
app/api/chat/route.ts
  -> auth, guest gating, rate limits, personalization, search mode cookie
  -> selectModel()
  -> createChatStreamResponse() or createEphemeralChatStreamResponse()
  -> researcher ToolLoopAgent
  -> search/fetch/feed/map/fact-check/source-preferences/todo/subtask tools
  -> streamed answer
  -> persistence and telemetry
```

`app/api/chat/route.ts` handles request parsing, share-page blocking, guest chat gating, guest limits, personalization, `quick`/`adaptive` mode selection, model selection, provider enablement, authenticated rate limits, and dispatch to authenticated or ephemeral stream response creation.

`lib/streaming/create-chat-stream-response.ts` loads existing chats for authorization, creates a Langfuse trace when tracing is enabled, prepares/prunes/truncates messages, creates the researcher agent, streams the response, emits metadata, persists the result, and flushes telemetry.

`lib/agents/researcher.ts` currently owns most orchestration. It builds a `ToolLoopAgent`, chooses active tools based on `quick` or `adaptive` mode, applies prompt overrides, injects personalization, adds prompt-level router/Fusion/Advisor guidance, wires OpenRouter server-tool headers, and sets `maxSteps` with `stepCountIs()`.

## Current modes and tools

Quick mode currently uses:

```text
search
fetch
googleFactCheck
sourcePreferences
```

Adaptive mode currently uses:

```text
search
feedSearch
fetch
todoWrite
researchSubtask
mapSearch
googleFactCheck
sourcePreferences
```

The current architecture already has useful building blocks, but they are orchestrated mostly by one researcher prompt rather than explicit typed Router, Coordinator, Fusion, Advisor, and Verifier modules.

## Current search path

`lib/tools/search.ts` creates the search tool, selects the provider, optionally calls `/api/advanced-search` for advanced SearXNG depth, applies provider fallbacks, blends configured feed results, applies user source preferences, enriches results with knowledge graph entities, and adds citation maps/tool-call IDs.

Important existing behaviors:

- general search can use a dedicated general provider or fall back to the primary provider;
- optimized search uses `SEARCH_API` or the default provider;
- SearXNG advanced depth routes through `app/api/advanced-search/route.ts`;
- feed blending can add configured feed results;
- user source preferences can modify ranking/filtering;
- knowledge graph enrichment attaches lightweight Wikidata/DBpedia entities;
- citation maps are added at the tool-result level.

## Current safe fetch path

`lib/tools/fetch.ts` already uses the safer outbound-fetch posture for regular page fetching:

- `safeFetch()`;
- `validateOutboundUrl()` for external extraction handoff URLs;
- `readResponseWithLimit()`;
- redirect cap;
- body-size cap;
- request timeout;
- content-type restriction for regular fetch.

This path is the model for hardening advanced search crawling.

## Current SSRF guard

`lib/utils/ssrf-guard.ts` already provides the right core security primitives:

- HTTP/HTTPS-only scheme validation;
- credential rejection;
- blocked hostname patterns;
- DNS resolution;
- private IPv4 and IPv6 blocking;
- manual redirect handling with re-validation at each hop;
- blocked-attempt logging with query/fragment sanitization;
- response body size limiting.

Phase AI-1 should reuse this utility rather than creating another outbound network stack.

## Current advanced search risk area

`app/api/advanced-search/route.ts` is the immediate Phase AI-1 target.

Current concerns:

- raw `http`/`https` clients are used instead of `safeFetch()`;
- raw `fetchHtml()` follows redirects recursively without a redirect-hop cap;
- redirects are not revalidated against the SSRF guard;
- HTML and JSON responses are accumulated into strings without `readResponseWithLimit()`;
- advanced result crawling fetches multiple arbitrary result URLs in parallel;
- cache keys include raw query/domain material;
- Redis cleanup uses module-level `setInterval()`;
- cleanup uses `keys('search:*')`, which is not ideal for production Redis/Upstash/serverless behavior;
- crawler errors are converted into synthetic HTML strings that then flow through the same extraction path.

These issues should be fixed before adding deeper Fusion, evidence graph, or entity-grounding behavior.

## Current entity grounding state

`lib/entities/knowledge-graph.ts` already implements lightweight entity enrichment:

- candidate query extraction from the user query and top search-result titles;
- Wikidata search via `searchWikidata()`;
- DBpedia search via `searchDbpedia()`;
- entity merge/deduplication;
- result enrichment through `enrichSearchResultsWithKnowledgeGraph()`.

Phase AI-6 should refactor and promote this existing implementation into dedicated modules. It should not rebuild Wikidata/DBpedia lookup from scratch unless the existing implementation is proven inadequate.

Expected extraction direction:

```text
lib/entities/
  knowledge-graph.ts          existing compatibility facade
  entity-extraction.ts        candidate extraction and normalization
  wikidata-client.ts          extracted existing Wikidata lookup
  dbpedia-client.ts           extracted existing DBpedia lookup
  entity-resolution.ts        merge, dedupe, disambiguation
  entity-grounding.ts         public orchestration API
  entity-confidence.ts        confidence scoring
```

## Current claim verification state

`lib/claims/evidence-verification.ts` already implements claim/citation verification primitives:

- claim-candidate extraction from answer text;
- citation reference parsing;
- cited-source resolution from citation maps;
- token-overlap evidence classification;
- negation mismatch detection;
- fact-check rating classification;
- `verifyAnswerClaims()` result generation.

Phase AI-12 should refactor, extend, or migrate this module into the new architecture. It should not create duplicate greenfield claim verification code.

Expected migration direction:

```text
lib/claims/evidence-verification.ts      existing implementation
lib/answers/verification/                future architecture-facing wrapper/modules
  extract-claims.ts                      reuse/extract existing claim candidate logic
  map-claims-to-evidence.ts              reuse cited-source resolution
  verify-citations.ts                    reuse/extend classifyEvidence and verifyAnswerClaims
  repair-unsupported-claims.ts           new repair policy
  repair-answer.ts                       new repair orchestration
```

## Current source preference vs source quality state

Morphic already supports user source preferences and search-result ranking/filtering. That is not the same as factual source quality.

Existing source preferences should remain a user-control layer. Phase AI-5 should add a separate Source Quality Engine so source preferences do not become factual authority.

## Current gaps before implementation

The current implementation does not yet have:

- typed `RoutePlan` generation before researcher execution;
- typed Coordinator decisions;
- canonical AI architecture schemas in code;
- explicit model-role capability registry;
- deterministic source-quality scoring;
- evidence-role classification;
- forum/Reddit/social influence caps in code;
- structured Evidence Graph as the composer substrate;
- provider-agnostic Fusion execution;
- provider-agnostic Advisor review;
- citation verification integrated into the final answer path;
- repair pass for unsupported or overbroad claims;
- research traces that capture architecture decisions without chain-of-thought.

## Phase AI-1 recommended scope

The next implementation PR should be narrow and safety-focused:

1. Replace raw advanced-search outbound fetches with `safeFetch()`.
2. Use `readResponseWithLimit()` for SearXNG JSON and crawled HTML responses.
3. Add explicit response size caps for JSON and HTML.
4. Reuse `AbortController` or `AbortSignal.timeout()` consistently for SearXNG and crawler fetches.
5. Remove recursive redirect handling from `fetchHtml()` and rely on `safeFetch()` redirect validation.
6. Hash cache keys instead of including raw query/domain strings.
7. Remove module-level `setInterval(cleanupExpiredCache, ...)`.
8. Avoid `keys('search:*')` cleanup in request/serverless runtime; rely on TTL and optional external maintenance.
9. Add focused tests for advanced-search safety behavior.

## Phase AI-1 non-goals

Do not implement Router, Coordinator, Fusion, Source Quality, Entity Grounding refactors, Evidence Graph, Advisor, or Citation Verifier in the same PR as advanced-search hardening.

The safety PR should be small enough to review and verify independently.

## Exit criteria for Phase AI-0

This baseline is complete when:

- current request flow is documented;
- current tool and retrieval flow is documented;
- existing safe-fetch, entity, and claim-verification assets are identified;
- advanced-search safety gaps are identified;
- Phase AI-1 scope is narrow and unambiguous.

This document satisfies Phase AI-0 and should be updated if Phase AI-1 discovers additional repo facts.
