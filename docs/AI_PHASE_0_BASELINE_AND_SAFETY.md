# AI Phase 0 Baseline and Safety Inventory

This document records the first implementation pass after the AI architecture documentation was merged. It covers Phase AI-0 and the first safety slice of Phase AI-1.

Companion documents:

- [AI Research Architecture](./AI_ARCHITECTURE.md)
- [AI Architecture Integration Phases](./AI_ARCHITECTURE_INTEGRATION_PHASES.md)
- [AI Architecture Schema Notes](./AI_ARCHITECTURE_SCHEMA_NOTES.md)
- [AI Role Prompts](./AI_ROLE_PROMPTS.md)

## Scope

Phase AI-0 asks us to confirm the current system state before deeper architecture changes. The most important finding from that baseline is that advanced search had safety debt that should be corrected before adding Router, Coordinator, Fusion, or deeper crawling behavior.

This PR therefore includes one low-risk Phase AI-1 safety patch for advanced search crawling.

## Current request flow baseline

The current answer path is still:

```text
app/api/chat/route.ts
  -> auth and rate limits
  -> search mode and model selection
  -> persistent or ephemeral stream creator
  -> lib/agents/researcher.ts ToolLoopAgent
  -> search/fetch/feed/fact-check/source-preference/map/subtask tools
  -> streamed answer
```

The current architecture is prompt-orchestrated rather than Router/Coordinator driven. The merged AI architecture docs define the target architecture, but implementation has not yet introduced typed RoutePlan, CoordinatorDecision, EvidenceItem, SourceQualityAssessment, or AdvisorFinding code schemas.

## Retrieval and evidence entry points

The major evidence entry points are:

- `lib/tools/search.ts` for web search provider dispatch, fallback handling, feed blending, source preferences, and knowledge graph enrichment.
- `lib/tools/fetch.ts` for URL fetching through the SSRF guard.
- `lib/tools/feed.ts` for RSS/Atom/RDF/JSON feed discovery and reading through safe fetch helpers.
- `lib/tools/factcheck.ts` for Google Fact Check API lookups.
- `lib/tools/subtask-agent.ts` for delegated research notes.
- `app/api/advanced-search/route.ts` for SearXNG-backed advanced search and result crawling.
- `lib/entities/knowledge-graph.ts` for current lightweight Wikidata and DBpedia enrichment.
- `lib/claims/evidence-verification.ts` for existing claim/citation verification behavior that later phases should refactor instead of duplicating.

## Phase AI-0 findings

### What is already good

- `lib/utils/ssrf-guard.ts` already provides URL validation, DNS/private IP blocking, redirect revalidation, and bounded response reading.
- `lib/tools/fetch.ts` already uses the SSRF guard for user-provided URLs.
- `lib/tools/feed.ts` already uses bounded safe fetch behavior for feed reads and discovery.
- Source preferences already separate trust/prefer/mute/block from raw search ranking.
- The repository already has unit tests for search provider fallback and feed blending.

### Safety gaps found

`app/api/advanced-search/route.ts` had several issues that should be fixed before any deeper research expansion:

- Advanced result crawling used raw Node `http`/`https` clients instead of the shared SSRF guard.
- Redirects were followed recursively without the shared redirect-hop limit or per-hop revalidation.
- Crawled HTML was accumulated into memory without the shared response-size cap.
- Cache keys included raw query/domain values instead of a stable hash.
- A module-level `setInterval` performed Redis key scanning and cleanup, which is serverless-hostile and unnecessary when Redis TTL is already used.
- JSDOM was configured with external resource loading enabled even though advanced search only needs static parsed HTML.

## Phase AI-1 safety patch included

The first safety patch updates `app/api/advanced-search/route.ts` to:

- use hashed cache keys;
- rely on Redis TTL instead of periodic key scanning;
- use `safeFetch()` for crawled result pages;
- use `readResponseWithLimit()` for crawled HTML;
- enforce a configurable crawl response cap via `ADVANCED_SEARCH_CRAWL_MAX_BYTES`;
- enforce a configurable crawl redirect cap via `ADVANCED_SEARCH_CRAWL_MAX_REDIRECTS`;
- bound SearXNG JSON response reads via `SEARXNG_RESPONSE_MAX_BYTES`;
- parse request input defensively;
- avoid JSDOM external resource loading during content extraction.

## Remaining Phase AI-1 work

This patch is the first safety slice, not the full AI-1 completion. Remaining follow-up work should include:

- Unit tests for advanced-search blocked private IP URLs.
- Unit tests for redirect-to-private-IP behavior.
- Unit tests for oversized crawled response handling.
- Unit tests for non-HTML/non-text crawl responses.
- A focused review of whether the configured SearXNG API URL should remain an internal trusted fetch path or use a separate allowlist validator for configured service URLs.
- A concurrency limit for advanced crawling so a large result set does not fan out too aggressively.
- Potential extraction of advanced-search safety helpers into testable modules outside the route handler.

## Next phase after this PR

After this safety slice lands, continue Phase AI-1 until the remaining tests and concurrency control are in place. Only then should implementation proceed to Phase AI-2 shared schemas and model capability routing.
