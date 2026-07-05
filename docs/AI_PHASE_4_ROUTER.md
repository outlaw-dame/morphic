# AI Phase 4 Router

This document records the first implementation slice of Phase AI-4 after the Phase AI-3 prompt-governance work landed.

Companion documents:

- [AI Research Architecture](./AI_ARCHITECTURE.md)
- [AI Architecture Integration Phases](./AI_ARCHITECTURE_INTEGRATION_PHASES.md)
- [AI Phase 2 Shared Schemas and Model Capabilities](./AI_PHASE_2_SCHEMAS_AND_CAPABILITIES.md)
- [AI Phase 3 Prompt Governance](./AI_PHASE_3_PROMPT_GOVERNANCE.md)

## Scope

This slice adds the first Router implementation under `lib/ai/router/`. It is deterministic and schema-backed. It does not call a model yet, and it does not replace the current researcher agent.

The Router now creates a validated `RoutePlan` from request metadata and query text. It also records prompt version and router model-selection metadata so a future model-backed Router can reuse the same execution boundary.

## Added modules

- `lib/ai/router/router.ts` implements `routeResearchRequest()`.
- `lib/ai/router/index.ts` exports Router utilities.
- `lib/ai/router/router.test.ts` covers the first deterministic routing behavior.

## What the Router currently decides

The deterministic Router currently infers:

- research mode;
- risk level;
- freshness requirement;
- entity-grounding requirement;
- advisor-review requirement;
- citation-verification requirement;
- required source classes for official or policy-like requests;
- required internal model roles;
- max tool-call budget;
- router prompt version;
- selected router-capable model id when model candidates are supplied.

## Why deterministic first

A deterministic first slice gives the app a stable routing boundary before adding live model calls. That keeps the work testable, preserves existing chat behavior, and makes it easier to compare future model-backed Router outputs against a known baseline.

## Current non-goals

This slice intentionally does not:

- replace the current researcher agent;
- call provider models for routing;
- alter chat route behavior;
- alter search, fetch, or feed tools;
- alter citation rendering;
- introduce Coordinator execution.

## Tests added

This slice tests:

- simple stable requests route as quick, low-risk plans;
- current or latest requests require freshness and adaptive mode;
- high-risk legal, medical, financial, or civic requests require critical mode and advisor review;
- explicit requested mode is honored while risk gates remain active;
- router-capable model selection metadata is surfaced.

## Next work

The next Router slice should introduce a role-runner boundary that can execute the Router prompt with a selected model and validate the response through `parseRoleOutput('router', output)`. The deterministic Router should remain available as a fallback and as a test oracle.
