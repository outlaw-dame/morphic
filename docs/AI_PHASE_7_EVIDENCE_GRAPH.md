# Phase AI-7 Evidence Graph Slice

## Purpose

Phase AI-7 starts replacing raw snippets and opaque notes with structured evidence records that downstream Router, Coordinator, Composer, Advisor, and Citation Verifier roles can reason over safely.

This slice is intentionally pure and additive. It does not fetch URLs, mutate chat behavior, write to a database, or access user-owned records. That keeps the phase free of authorization and IDOR-style object-access risk while the data contracts stabilize.

## Added modules

```text
lib/ai-architecture/evidence/
  claim-extraction.ts
  evidence-dedupe.ts
  evidence-graph.ts
  evidence-graph.test.ts
  evidence-types.ts
  evidence-url.ts
  normalize-search-result.ts
  index.ts
```

## Security and hardening decisions

- Evidence URLs are parsed with `URL` and only `http:` / `https:` are accepted.
- Credentials and fragments are stripped from canonical URLs.
- Invalid or unsupported schemes are excluded before `EvidenceItem` creation.
- Malformed result titles/content fall back to bounded host/title values instead of throwing.
- No live network calls are made by this layer.
- No user identifiers or persisted objects are accepted by this layer.
- Duplicate canonical URLs are grouped and cannot become independent support.
- Copied summaries across different hosts are marked as copied rather than trusted as independent corroboration.
- Claim clusters count independent hosts, not raw duplicate snippets.

## Current behavior

`buildEvidenceGraph()` accepts search-style results and returns:

- normalized schema-backed evidence items;
- canonical URL duplicate groups;
- deterministic atomic claims;
- repeated-claim clusters;
- source-quality metadata;
- entity metadata already attached to search results;
- warnings for skipped invalid inputs.

## Non-goals

This phase does not yet:

- wire evidence graphs into live chat;
- normalize fetch/feed/fact-check tool outputs;
- replace subtask notes;
- perform contradiction detection;
- persist evidence graphs;
- introduce model-generated claim extraction.

## Follow-up phases

- Phase AI-7 follow-up: normalize fetch/feed/fact-check outputs.
- Phase AI-8: Coordinator source-mix, entity-grounding, freshness, and duplication checks.
- Phase AI-10: Composer consumes evidence graphs instead of raw snippets.
