# Local Search Aggregation Design

## Status

Approved for implementation planning on 2026-06-20.

## Objective

Add a first-class local-search research path that combines structured Google
Places data with bounded web-search evidence from relevant review platforms,
official sites, tourism authorities, professional directories, and reputable
local publications. The resulting answer must be rich, current, attributable,
and honest about source limitations without requiring paid Yelp, Tripadvisor,
or Foursquare API credentials.

## Product Principles

1. Structured provider facts and indexed web evidence are different evidence
   classes and must remain distinguishable throughout the pipeline.
2. Search snippets are discovery evidence. They must not be represented as a
   complete review corpus or an official provider API response.
3. A rating is reported only when the retrieved evidence explicitly contains
   the rating, scale, and source. Missing ratings are never inferred.
4. Cross-platform disagreement is useful information and must not be hidden by
   averaging incompatible scales or review populations.
5. Recommendations must explain why a place fits the user's request, not merely
   list popular businesses.
6. Partial, well-labeled evidence is better than fabricated completeness.
7. Local-search work must remain bounded so ordinary questions do not trigger
   unnecessary provider calls or excessive latency.

## Scope

### Included

- Deterministic local/geographic intent analysis.
- A dedicated `localSearch` agent tool.
- Google Places structured place search using a configured server-side key.
- Category-aware web searches targeting indexed pages from Yelp, Tripadvisor,
  Foursquare, Michelin Guide, OpenTable, Booking.com, official destination
  sites, professional registries, and reputable local publications when they
  are relevant to the query.
- Entity resolution across provider results and web evidence.
- Evidence normalization, provenance, freshness, and confidence metadata.
- Cross-source ranking and synthesis guidance.
- Clear attribution, disagreement, and coverage reporting.
- Bounded concurrency, timeouts, graceful degradation, and safe logging.
- Unit, integration, prompt-contract, and failure-path tests.

### Excluded

- Paid Yelp, Tripadvisor, or Foursquare API integrations.
- Scraping review pages, bypassing anti-bot controls, or automating CAPTCHAs.
- Persisting full Google Places responses, review text, or prohibited provider
  content.
- Treating search snippets as full reviews.
- Building a map-rendering interface in this phase.
- Booking, reservation, purchasing, or lead-generation workflows.
- Background crawling or pre-fetching local results.

## External Constraints

### Google Places

Google Places is the structured source for place identity and operational data.
Requests must use explicit field masks to control cost and data exposure. The
initial implementation requests only fields required by the response contract:

- `places.id`
- `places.displayName`
- `places.formattedAddress`
- `places.location`
- `places.primaryType`
- `places.businessStatus`
- `places.rating`
- `places.userRatingCount`
- `places.priceLevel`
- `places.currentOpeningHours`
- `places.websiteUri`
- `places.googleMapsUri`
- `places.nationalPhoneNumber`
- `places.attributions`
- `places.reviews` when `GOOGLE_PLACES_REVIEWS_ENABLED=true`

Google Places returns a limited review sample rather than a complete review
corpus. Review retrieval is enabled only through the server-side
`GOOGLE_PLACES_REVIEWS_ENABLED` cost control because it triggers a higher-cost
Places data tier. Enabled responses retain review rating, text, publish time,
Google Maps URI, and author attribution. Displayed review-derived claims must
identify Google Reviews and preserve the required nearby author and provider
attribution. Review content is never persisted.

Google-generated place, area, and review summaries are not requested in this
implementation. Those fields add separate disclosure, reporting-link,
reference-link, and verbatim-display requirements and require a separately
reviewed presentation design.

Google content remains request-scoped and ephemeral. The application may retain
Google Place IDs where allowed, but does not cache full place responses. Any
displayed Google data is labeled `Google Places` and includes the Google Maps
link and required provider attributions.

Reference:
https://developers.google.com/maps/documentation/places/web-service/place-details
https://developers.google.com/maps/documentation/places/web-service/policies

### Indexed Review Sources

Yelp, Tripadvisor, Foursquare, and other review platforms are queried through
the application's configured general web-search provider. The application does
not call their paid APIs and does not fetch or scrape blocked review pages.

Search results retain their source URL, title, snippet, publication timestamp
when available, retrieval timestamp, and search tool call identifier. The final
answer cites these results as web sources. It may summarize recurring themes
supported by snippets, but must use qualified language such as `indexed Yelp
results mention` rather than claiming access to all Yelp reviews.

## Architecture

### 1. Local Intent Analyzer

Create a deterministic analyzer that returns:

```ts
interface LocalSearchIntent {
  isLocal: boolean
  confidence: 'high' | 'medium' | 'low'
  category:
    | 'restaurant'
    | 'hotel'
    | 'attraction'
    | 'service'
    | 'shopping'
    | 'healthcare'
    | 'general'
  locationText?: string
  nearMe: boolean
  constraints: string[]
  reviewRequested: boolean
}
```

High-confidence signals include an explicit location paired with a place or
service category, `near me`, `nearby`, directions, opening-hours requests, and
best-place recommendation language. Broad city overview questions remain on the
existing place-overview path unless they ask for businesses, venues, or nearby
recommendations.

The analyzer is not responsible for obtaining device location. `near me`
requires coordinates supplied through the tool call or a user clarification.
The system never silently infers precise user location from IP data.

### 2. Dedicated Local Search Tool

Add a `localSearch` tool rather than embedding fan-out logic in generic search
or overloading route calculation in `mapSearch`.

```ts
interface LocalSearchInput {
  query: string
  location?: { text?: string; lat?: number; lng?: number }
  category?: LocalSearchIntent['category']
  maxPlaces?: number
  includeReviewEvidence?: boolean
}
```

The schema bounds `query` and location text lengths, validates coordinate
ranges, and caps `maxPlaces` at 10. The default is 6 places. The tool emits a
searching state followed by one complete aggregate result.

### 3. Structured Place Retrieval

Extend the Google map provider without changing the directions contract.
`searchPlaces` returns normalized structured fields plus source metadata:

```ts
interface LocalPlaceFact {
  provider: 'google_places'
  providerPlaceId: string
  name: string
  formattedAddress: string
  location?: { lat: number; lng: number }
  primaryType?: string
  businessStatus?: string
  rating?: { value: number; scale: 5; count?: number }
  reviews?: Array<{
    rating?: number
    text?: string
    publishedAt?: string
    googleMapsUrl?: string
    author: { displayName: string; profileUrl?: string; photoUrl?: string }
  }>
  priceLevel?: string
  openNow?: boolean
  websiteUrl?: string
  mapUrl?: string
  phoneNumber?: string
  attributions: Array<{ provider: string; providerUrl?: string }>
  retrievedAt: string
}
```

The provider uses an abort timeout, validates response shape, redacts API keys
from errors, and maps upstream statuses to typed errors. It retries only
transient failures (`429`, `500`, `502`, `503`, `504`) with bounded exponential
backoff and jitter. Authentication, permission, billing, and malformed-request
errors are not retried.

### 4. Category-Aware Evidence Planner

The planner creates at most four web-search requests. It uses domain filters
supported by the existing search abstraction instead of scraping sites.

Suggested source groups:

| Category   | Review/discovery sources                     | Authority sources                                 |
| ---------- | -------------------------------------------- | ------------------------------------------------- |
| Restaurant | Yelp, Tripadvisor, Michelin Guide, OpenTable | official restaurant site, local food publications |
| Hotel      | Tripadvisor, Booking.com                     | official hotel site, tourism authority            |
| Attraction | Tripadvisor, Atlas Obscura, Wikivoyage       | official attraction and tourism sites             |
| Service    | Yelp, relevant professional directories      | licensing boards, BBB, official business site     |
| Shopping   | Yelp, Tripadvisor, local guides              | official store or market site                     |
| Healthcare | reputable patient directories where indexed  | licensing boards and provider sites               |
| General    | Yelp, Tripadvisor, Foursquare                | official site and reputable local publications    |

The planner does not require every named platform for every query. For example,
Michelin is useful for restaurants but not plumbers. Source selection is based
on category, region, and user constraints.

Each query includes the canonical place name and locality when enriching a
specific Google candidate. Broad discovery searches include the requested
category, locality, and one user constraint. Query count and concurrency remain
bounded.

### 5. Evidence Normalization

```ts
interface LocalWebEvidence {
  sourceKind:
    | 'review_platform'
    | 'official'
    | 'tourism_authority'
    | 'local_publication'
    | 'directory'
    | 'general_web'
  sourceName: string
  url: string
  title: string
  snippet: string
  publishedAt?: string
  retrievedAt: string
  explicitRating?: { value: number; scale: number; count?: number }
  matchedPlaceId?: string
  matchConfidence: 'high' | 'medium' | 'low' | 'unmatched'
  toolCallId?: string
}
```

Explicit ratings are accepted only from structured search-provider fields or a
strict parser that finds the value, scale, and source together in the retrieved
result. The parser does not extract a bare number followed by `stars` without a
confirmed place match.

### 6. Entity Resolution

Evidence is linked to a structured place using multiple independent signals:

1. Normalized place name and aliases.
2. Locality or formatted-address overlap.
3. Official website domain.
4. Geographic proximity when coordinates exist.
5. Phone number when safely available.

Name similarity alone is insufficient. A high-confidence match requires one
strong identifier (website, phone, or close coordinates) or a name match plus
locality/address agreement. Medium-confidence evidence can inform discovery but
cannot supply a place-specific rating. Low-confidence and unmatched evidence is
kept separate or omitted from the recommendation.

Chain branches, businesses with duplicate names, moved locations, and similarly
named venues receive explicit collision tests.

### 7. Ranking

Ranking is deterministic and explainable. It combines:

- Query and constraint relevance.
- Distance when the user supplied coordinates.
- Operational status.
- Google rating confidence adjusted by review count.
- Number and quality of independent corroborating source classes.
- Freshness of time-sensitive evidence.
- Cross-source agreement or disagreement.
- Source-preference rules already configured by the user.

The system never directly averages ratings with different scales or unknown
review populations. Rating evidence is displayed per source. Ranking metadata
contains component scores and short reason codes so the agent can explain why a
result was promoted.

### 8. Tool Result

```ts
interface LocalSearchResult {
  query: string
  intent: LocalSearchIntent
  places: Array<{
    place: LocalPlaceFact
    evidence: LocalWebEvidence[]
    score: number
    reasons: string[]
    disagreements: string[]
  }>
  unmatchedEvidence: LocalWebEvidence[]
  coverage: {
    googlePlaces: 'complete' | 'partial' | 'unavailable'
    searchedSources: string[]
    unavailableSources: string[]
  }
  warnings: string[]
  toolCallId?: string
}
```

No provider credential, request header, precise device location, or raw internal
error is included in the tool result.

## Agent Behavior

Update quick and adaptive prompts plus tool descriptions with these rules:

1. Use `localSearch` for business, venue, nearby, opening-hours, and local
   recommendation queries.
2. Use `mapSearch` for directions and explicit provider-only map actions.
3. Use ordinary `search` for broad city, history, culture, or travel-overview
   questions that are not asking for specific venues.
4. Ask for a locality when omission would make results ambiguous. Ask for
   coordinates only when distance or `near me` is essential.
5. Do not claim that every named platform was consulted. Report actual coverage.
6. Label Google fields as `Google Places` and cite indexed web evidence using
   its real search tool call IDs.
7. Describe repeated review themes only when at least two independent pieces of
   evidence support them.
8. Mention material disagreements, low-confidence matches, stale evidence, and
   provider failures.

## Answer Contract

The answer should scale with the query. A rich recommendation response normally
contains:

- A concise recommendation summary.
- A ranked shortlist with fit, trade-offs, location, operational details, and
  provider-specific ratings when verified.
- A `What reviewers consistently mention` section for supported themes.
- A `Where sources disagree` section when applicable.
- Practical next steps such as checking current hours, reservations, or the
  official site.
- Inline citations and visible source labels.
- A brief coverage note listing sources actually searched and unavailable data.

The answer must not imply exhaustive coverage of Yelp, Tripadvisor, Google
Reviews, or any other platform.

## Reliability and Failure Handling

- Google Places and web evidence retrieval run concurrently after intent and
  location are validated.
- Each provider has an independent timeout and abort signal.
- Fan-out uses a small concurrency limit.
- One provider failure does not discard successful evidence from another.
- Transient retries use bounded exponential backoff with jitter.
- A request-wide deadline stops remaining work and returns partial coverage.
- Empty results produce an honest clarification or broadened-search suggestion.
- Logs contain provider name, duration, status class, and correlation ID but no
  credentials, raw review text, or precise user coordinates.

## Privacy and Security

- Provider keys remain server-side.
- User coordinates are request-scoped, excluded from logs, and never persisted
  by local search.
- All provider URLs are fixed allowlisted endpoints.
- Search-result URLs pass existing URL and external-navigation safety checks.
- Tool inputs have strict length, type, coordinate, count, and domain limits.
- External text is treated as untrusted evidence and cannot alter tool or agent
  instructions.
- Output is escaped by existing rendering components.
- Error messages are normalized and do not expose upstream payloads or secrets.

## Freshness and Caching

- Google Places responses are not persisted or placed in a cross-request cache.
- Web evidence follows the existing search provider's request-time behavior.
- Every evidence item records `retrievedAt` and optional `publishedAt`.
- Time-sensitive facts such as hours, closures, pricing, and availability are
  presented with freshness caveats and official-site links.
- Place IDs may be retained only where provider policy explicitly permits it.

## Testing Strategy

### Unit Tests

- Local intent: positive, negative, ambiguous, city-overview, `near me`, and
  missing-location cases.
- Category source planning and query-count bounds.
- Input validation and coordinate limits.
- Rating extraction requiring value, scale, source, and place match.
- Entity resolution for exact matches, chains, aliases, duplicate names,
  address conflicts, website matches, and geographic distance.
- Ranking order, review-count confidence, disagreement penalties, and stable
  tie-breaking.
- Retry classification, backoff bounds, abort handling, and secret redaction.

### Provider Contract Tests

- Google field masks include attribution, required structured fields, and
  reviews only when the explicit review cost control is enabled.
- Google response normalization and malformed payload handling.
- Web evidence keeps source URLs and tool call IDs.
- Partial provider failure produces explicit coverage metadata.

### Agent Contract Tests

- Local business queries expose and select `localSearch`.
- Directions continue using `mapSearch`.
- Broad city overviews remain on normal search.
- Prompts prohibit fabricated coverage and incompatible rating averages.
- Final synthesis labels Google Places and cites actual web evidence.

### Integration Tests

- Restaurant search with Google plus Yelp and Tripadvisor indexed evidence.
- Hotel search where one review source is unavailable.
- Service search with two same-name businesses in different localities.
- `Near me` query without coordinates returns a clarification rather than IP
  geolocation.
- Google Places unavailable but official and review-platform web evidence exists.
- Web search unavailable but Google Places returns structured candidates.

## Observability and Acceptance Criteria

The feature is complete when:

1. High-confidence local queries reliably invoke `localSearch`.
2. Non-local informational queries do not incur local-search fan-out.
3. Google Places facts and indexed web evidence remain visibly distinct.
4. Each recommendation can be traced to structured facts and real source URLs.
5. Entity collisions do not merge businesses based on name alone.
6. Ratings are never inferred or averaged across incompatible scales.
7. Provider failures return partial results with explicit coverage and warnings.
8. No paid review-platform key is required.
9. No review-site scraping is introduced.
10. Google review samples, when enabled, are ephemeral and retain required
    author and provider attribution.
11. Focused tests, full unit tests, TypeScript, lint, formatting, and CI checks
    pass.

## Implementation Sequence

1. Define intent, evidence, aggregate result, and typed error contracts.
2. Add failing intent and schema tests, then implement the analyzer.
3. Add failing Google provider contract tests, then enrich structured fields.
4. Add failing evidence-planner tests, then implement bounded domain searches.
5. Add failing entity-resolution tests, then implement matching.
6. Add failing ranking tests, then implement explainable scoring.
7. Add the `localSearch` orchestration tool with partial-result recovery.
8. Wire the tool into the researcher and prompts with contract tests.
9. Add integration tests, documentation, and environment guidance.
10. Run complete verification and review the diff for privacy, attribution,
    caching, and retry correctness.
