# Phase AI-10 Evidence Conflict Analysis

## Purpose

Phase AI-10 adds deterministic evidence conflict analysis to the evidence graph. The goal is to replace fragile free-form contradiction warning strings with structured conflict metadata that can feed the Coordinator contradiction policy.

This phase is intentionally conservative and additive. It does not call models, browse the network, persist data, mutate user state, or execute repairs. It analyzes already-normalized evidence and already-extracted claims in memory.

## Added modules

```text
lib/ai-architecture/evidence/
  conflict-analysis.ts
  conflict-analysis.test.ts
```

## Graph changes

`EvidenceGraph` now includes:

```ts
conflicts: EvidenceConflict[]
```

`buildEvidenceGraph()` now:

1. normalizes search results;
2. deduplicates evidence;
3. extracts and clusters claims;
4. runs deterministic conflict analysis over usable, non-duplicate, non-copied evidence;
5. appends Coordinator-readable conflict warnings.

## Conflict types

The first deterministic pass detects:

- `negation_overlap`: similar claims where one side contains explicit negation and the other does not;
- `numeric_mismatch`: similar claims with different numeric values;
- `status_mismatch`: similar claims using opposing status/outcome language such as approved/rejected or legal/illegal.

## Severity

- `negation_overlap`: `block`
- `status_mismatch`: `block`
- `numeric_mismatch`: `warn`

The Coordinator still owns final route gating. The analyzer only emits evidence-graph metadata and warning strings.

## Safety and correctness boundaries

- No model/prompt judgment.
- No database access.
- No user-owned object access.
- No network calls.
- No automatic repair execution.
- Duplicate and copied evidence are excluded from conflict pairing.
- IDs are deterministic and stable for the same conflict inputs.

## Regression coverage

Tests cover:

- negation conflicts across independent evidence;
- numeric mismatches as warnings;
- duplicate/copied evidence exclusion;
- warning formatting for Coordinator contradiction policy.

## Follow-up

- Add richer contradiction taxonomies once claim extraction captures polarity, quantities, entities, and temporal scopes explicitly.
- Feed structured conflict metadata directly into Coordinator policy results instead of relying on warning strings.
- Add UI/debug metadata for showing exactly which evidence items disagree.
