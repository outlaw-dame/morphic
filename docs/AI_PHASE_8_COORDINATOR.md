# Phase AI-8 Coordinator Policy Slice

## Purpose

Phase AI-8 adds a deterministic Coordinator policy layer before answer composition. The Coordinator evaluates whether the current route and evidence graph are safe enough to compose from, or whether the system should retrieve more evidence, run entity grounding, escalate to Advisor, or require Citation Verifier.

This slice is intentionally additive and does not change live chat behavior yet.

## Added modules

```text
lib/agents/coordinator/
  coordinator.ts
  execution-state.ts
  policy-types.ts
  source-mix-policy.ts
  freshness-policy.ts
  entity-grounding-policy.ts
  contradiction-policy.ts
  escalation-policy.ts
  repair-policy.ts
  coordinator.test.ts
  index.ts
```

## Security and correctness boundaries

- No database access.
- No user-owned object access.
- No network calls.
- No prompt/model judgment is used for policy decisions.
- Duplicate and copied evidence is ignored by source-mix checks.
- High-risk or critical routes cannot compose from weak/community-only sources.
- Freshness-sensitive routes require recent evidence.
- Entity-grounding routes require grounded entities on usable evidence.
- Contradiction warnings hold high-risk composition for review.

## Current behavior

`coordinateExecution()` receives a `CoordinatorExecutionState` and returns:

- schema-backed `CoordinatorDecision`;
- individual policy results;
- a repair plan with concrete actions;
- Advisor/Citation Verifier escalation requirements.

## Non-goals

This phase does not yet:

- wire Coordinator into the live researcher stream;
- execute repair actions;
- run live retrieval;
- call models;
- persist execution state;
- replace Composer behavior.

## Follow-up

- Wire Coordinator into adaptive/critical research flow after Fusion and evidence paths stabilize.
- Expand contradiction detection beyond warnings once Phase AI-9/AI-10 evidence flows mature.
- Remove remaining formatter-only deferrals from earlier AI slices when local formatter output is available.
