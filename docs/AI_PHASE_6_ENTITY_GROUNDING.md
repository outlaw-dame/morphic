# Phase AI-6 Entity Grounding Slice

## Purpose

Phase AI-6 starts turning Morphic's lightweight knowledge-graph enrichment into a dedicated entity-grounding layer. The goal is to reduce entity confusion before answer composition and expose structured resolved entities for later Coordinator and evidence-graph phases.

This slice intentionally preserves the existing `lib/entities/knowledge-graph.ts` public API while splitting the implementation into smaller modules.

## Added modules

```text
lib/entities/
  entity-types.ts
  entity-extraction.ts
  entity-fetch.ts
  wikidata-client.ts
  dbpedia-client.ts
  entity-confidence.ts
  entity-resolution.ts
  entity-grounding.ts
  entity-grounding.test.ts
```

## Behavior

- Extracts deterministic entity mentions from the user query, top result titles, and short result-content leads.
- Looks up candidate entities through Wikidata and DBpedia clients.
- Resolves duplicate candidates into canonical `ResolvedEntity` records.
- Merges same-label Wikidata/DBpedia candidates when they represent the same canonical entity.
- Flags ambiguity when same-label candidates map to different canonical IDs or conflicting descriptions.
- Keeps knowledge-graph results contextual. They do not override fresher primary sources for current claims.

## Compatibility

Existing callers can keep using:

```ts
lookupKnowledgeGraphEntities(query, results)
enrichSearchResultsWithKnowledgeGraph(searchResult)
```

The returned records remain structurally compatible with the prior `KnowledgeGraphEntity` shape, with additional `ResolvedEntity` fields for downstream consumers.

## Validation added

The tests cover:

- query/result mention extraction;
- Wikidata + DBpedia merge behavior;
- same-label ambiguity flags;
- injected lookup clients so tests do not depend on live network calls.

## Remaining work for later phases

- Attach resolved entities directly to normalized `EvidenceItem[]` in Phase AI-7.
- Surface entity ambiguity to Coordinator policies in Phase AI-8.
- Add richer domain/entity-type hints for people, companies, products, places, and events.
- Add trace-safe entity-grounding metadata once observability reaches Phase AI-13.
