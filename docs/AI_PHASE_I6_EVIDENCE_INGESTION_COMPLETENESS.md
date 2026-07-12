# Phase AI-I6 — Evidence Ingestion Completeness

## Status

In progress on PR #107. No production rollout or release authority is enabled by this phase.

## Purpose

Ensure every retrieval result admitted into the governed evidence graph is normalized through one route-bound, provenance-preserving boundary before deterministic Coordinator policy evaluates it.

## Implemented boundary

- Evidence graph input is bounded to 500 results and a 16,000-character query.
- Fusion-derived evidence must include immutable retrieval provenance.
- Retrieval provenance is bound to the exact signed Router digest.
- Missing, malformed, stale-route, and unsupported provenance fails closed for Fusion routes.
- Ordinary non-Fusion ingestion remains compatible, while malformed optional provenance is excluded and audited.
- Per-result retrieval timestamps take precedence over batch timestamps.
- Path ID, path purpose, planned source class, route digest, and retrieval time survive normalization.
- Planned source class is never trusted as the deterministic classified source class.
- URL canonicalization, schema parsing, source-quality assessment, claim extraction, duplicate detection, copied-content detection, clustering, and conflict analysis remain in the canonical graph pipeline.
- Every excluded result has a bounded result index and reason code.
- The graph exposes immutable ingestion counts and route-binding metadata.
- The live Coordinator handoff requires provenance whenever the signed route requires Fusion planning.
- Freshness-sensitive routes accept audited per-result timestamps and do not require a redundant batch timestamp.

## Fail-closed conditions

Fusion evidence ingestion rejects:

- missing retrieval provenance;
- malformed path purpose, source class, path ID, route digest, or timestamp;
- route-digest mismatch;
- invalid or unsupported URLs;
- schema-invalid normalized evidence.

No rejected Fusion result is silently treated as partial corroboration.

## Trust boundaries

- Fusion Planner source classes represent requested lanes, not verified source identity.
- Deterministic source classification remains authoritative for evidence weighting.
- Retrieval provenance does not imply entity grounding, source-quality role completion, composition approval, citation verification, or release approval.
- User-controlled search result fields cannot mark roles complete.
- Evidence graph normalization performs no network, database, filesystem, or user-owned object access.

## Validation requirements

Tests must prove:

- path-level provenance and per-result retrieval time survive normalization;
- missing Fusion provenance fails closed;
- evidence bound to another route fails closed;
- optional non-Fusion exclusions are audited deterministically;
- planned source class cannot override deterministic classification;
- live Coordinator handoff rejects forged-route evidence;
- legacy conflict and evidence graph behavior remains intact;
- type checking, formatting, lint, tests, native verification, and production build pass.
