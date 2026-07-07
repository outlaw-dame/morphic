# Phase AI-9 Coordinator Admission Bridge

## Purpose

Phase AI-9 turns the deterministic Coordinator policy layer from Phase AI-8 into a reusable admission bridge. The bridge gives adaptive and critical research flows a single safe call boundary for deciding whether evidence can move to answer composition or must first run repairs.

This phase remains intentionally additive. It does not execute network calls, persist state, call models, or replace the live stream pipeline. It prepares the live wiring by making the Coordinator decision shape easy to consume without duplicating policy logic.

## Added modules

```text
lib/agents/coordinator/
  admission.ts
  admission.test.ts
```

## Public API

`createCoordinatorAdmission(input)` accepts an existing `EvidenceGraph` and `RoutePlan`, evaluates Coordinator policies, and returns:

- `status`: `compose` or `repair`;
- `canCompose`: boolean mirror of the repair-plan gate;
- `blockedPolicyIds`: failed blocking policy ids;
- `warningPolicyIds`: failed warning policy ids;
- `requiredRepairActions`: concrete repair/escalation actions;
- the full Coordinator evaluation, including `decision`, `policyResults`, and `repairPlan`.

`createCoordinatorAdmissionFromSearchResults(input)` builds an evidence graph from normalized search results and then evaluates the same admission gate. This is the intended adapter for future adaptive flow wiring where search/fusion results already exist in memory.

## Security and correctness boundaries

- No database access.
- No user-owned object access.
- No network calls.
- No model/prompt judgment.
- No automatic execution of repair actions.
- No mutation of input evidence graphs.
- No weakening of Coordinator policies for live integration convenience.

## Regression coverage

The phase adds tests for:

- successful composition admission when freshness and required source-class policies are satisfied by independent evidence;
- repair admission when a critical route has only weak/community evidence, including authoritative-source retrieval and Advisor escalation actions.

## Follow-up

- Wire admission metadata into adaptive stream telemetry and UI metadata.
- Convert repair action names into explicit repair executors once retrieval/fusion retry policy is stable.
- Feed contradiction warnings from richer Phase AI-10 evidence conflict analysis instead of warning strings alone.
