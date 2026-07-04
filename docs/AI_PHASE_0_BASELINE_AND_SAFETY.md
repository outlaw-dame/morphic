# AI Phase 0 Baseline and Safety Inventory

This document records the first implementation pass after the AI architecture documentation was merged. It covers Phase AI-0 and the first safety slices of Phase AI-1.

Companion documents:

- [AI Research Architecture](./AI_ARCHITECTURE.md)
- [AI Architecture Integration Phases](./AI_ARCHITECTURE_INTEGRATION_PHASES.md)
- [AI Architecture Schema Notes](./AI_ARCHITECTURE_SCHEMA_NOTES.md)
- [AI Role Prompts](./AI_ROLE_PROMPTS.md)

## Scope

Phase AI-0 asks us to confirm the current system state before deeper architecture changes. The most important finding from that baseline is that advanced search had safety debt that should be corrected before adding Router, Coordinator, Fusion, or deeper crawling behavior.

This PR therefore includes Phase AI-0 inventory work and Phase AI-1 safety hardening for advanced search crawling.

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
- `lib/tools/search/advanced-search.ts` for advanced-search request parsing, cache-key hashing, crawl safety, content extraction, domain filtering, scoring, and bounded concurrency.
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
- Crawling was fan-out based on result count without an explicit concurrency cap.
- The advanced-search route mixed HTTP handling, cache handling, crawl safety, content extraction, filtering, scoring, and request parsing in one hard-to-test file.

## Phase AI-1 safety work included

The safety patch updates advanced search to:

- use hashed cache keys;
- rely on Redis TTL instead of periodic key scanning;
- use `safeFetch()` for crawled result pages;
- use `readResponseWithLimit()` for crawled HTML;
- enforce a configurable crawl response cap via `ADVANCED_SEARCH_CRAWL_MAX_BYTES`;
- enforce a configurable crawl redirect cap via `ADVANCED_SEARCH_CRAWL_MAX_REDIRECTS`;
- bound SearXNG JSON response reads via `SEARXNG_RESPONSE_MAX_BYTES`;
- parse request input defensively;
- avoid JSDOM external resource loading during content extraction;
- enforce bounded crawl fan-out via `ADVANCED_SEARCH_CRAWL_CONCURRENCY`;
- extract advanced-search helper logic into `lib/tools/search/advanced-search.ts`;
- add unit tests for request parsing, cache-key hashing, domain filtering, HTML extraction, relevance scoring, quality filtering, and concurrency limiting;
- add advanced-search-level tests for non-HTML/non-text crawl response rejection and text crawl response bounded reads;
- add SSRF guard network-path tests for private IP literals, internal hostnames, redirect-to-private-IP blocking, content-length size rejection, and streamed body overflow.

## Configured SearXNG service URL policy

The configured `SEARXNG_API_URL` path is treated as a trusted deployment setting, not a user-supplied URL. It should remain separate from normal user-controlled fetch validation because local and private SearXNG deployments are legitimate production topologies for self-hosted Morphic installs.

That trust boundary still needs guardrails:

- `SEARXNG_API_URL` must never be derived from request input, cookies, query parameters, user profile data, or chat content.
- Cloud-hosted deployments should prefer an explicit allowlist or deployment-time validation for configured service URLs.
- User-controlled result URLs must continue to flow through `safeFetch()` and redirect-hop revalidation.
- Future Router/Fusion integrations must not reuse configured-service fetch paths for arbitrary user URLs.

## Remaining Phase AI-1 work

This PR completes the initial advanced-search hardening slice and adds direct SSRF guard network-path coverage, but Phase AI-1 should continue with route-specific coverage and service-configuration guardrails:

- Optional route-level tests for the `POST` handler once the project has a route-handler test pattern.
- Optional deployment-time validation for configured service URLs, especially cloud-hosted `SEARXNG_API_URL` allowlisting.
- Style-only normalization to remove the narrow temporary Prettier/ESLint deferrals for the advanced-search files once formatter/linter diagnostics are available locally or untruncated.

## Next phase after this PR

After this safety slice lands, Phase AI-1 can continue with route-level coverage and configured-service URL guardrails. If those are intentionally deferred, implementation can proceed to Phase AI-2 shared schemas and model capability routing without expanding crawling or retrieval scope further.
