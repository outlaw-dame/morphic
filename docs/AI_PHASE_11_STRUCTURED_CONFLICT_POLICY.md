# Phase AI-11 Structured Conflict Policy

## Purpose

Phase AI-11 wires Phase AI-10's structured evidence conflicts directly into the Coordinator contradiction policy.

The previous bridge still depended on warning text such as `conflict:` or `disputed`. That was useful as a compatibility layer, but it meant the Coordinator had to infer policy decisions from strings. This phase makes the structured `EvidenceGraph.conflicts` array the primary signal while keeping the warning fallback for older graph producers.

## What changed

`CoordinatorPolicyResult` now carries optional structured details:

```ts
details: CoordinatorPolicyDetail[]
```

The contradiction policy now:

1. reads `state.evidenceGraph.conflicts` directly;
2. maps each conflict into policy details with conflict ID, type, severity, evidence IDs, claim IDs, and reason;
3. blocks composition for structured `block` conflicts;
4. treats structured `warn` conflicts as warnings unless the route is high or critical risk;
5. falls back to legacy warning-string detection only when no structured conflicts are present.

## Safety boundaries

- No model calls.
- No network calls.
- No database access.
- No user-owned object access.
- No repair execution.
- No live stream behavior changes.
- No change to source retrieval behavior.

## Why this matters

The Coordinator can now explain exactly which evidence items and claims disagree. That gives later repair and UI/debug phases a stable contract instead of parsing warning strings.

## Regression coverage

Tests cover:

- structured block conflicts holding composition without any warning strings;
- conflict details preserving IDs, severities, evidence IDs, claim IDs, and reasons;
- structured numeric warning conflicts allowing low-risk composition;
- legacy warning-string contradiction behavior remaining intact;
- substring-safe warning matching from earlier phases remaining intact.

## Follow-up

- Surface structured conflict details in admission/debug metadata.
- Convert conflict details into targeted repair requests for disambiguating retrieval.
- Add UI/debug affordances that show which evidence items disagree without exposing unrelated user state.
