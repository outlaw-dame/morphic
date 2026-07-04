# AI Phase 2 Shared Schemas and Model Capabilities

This document records the first implementation slice of Phase AI-2 after the Phase AI-0/AI-1 safety baseline landed.

Companion documents:

- [AI Research Architecture](./AI_ARCHITECTURE.md)
- [AI Architecture Integration Phases](./AI_ARCHITECTURE_INTEGRATION_PHASES.md)
- [AI Architecture Schema Notes](./AI_ARCHITECTURE_SCHEMA_NOTES.md)
- [AI Phase 0 Baseline and Safety Inventory](./AI_PHASE_0_BASELINE_AND_SAFETY.md)

## Scope

Phase AI-2 starts turning the architecture documents into stable code contracts. The goal of this slice is not to replace the current researcher agent yet. The goal is to add shared typed primitives that Router, Coordinator, Fusion, Source Quality, Entity Grounding, Advisor, Citation Verifier, and later library extraction can reuse.

## Added schema modules

The new shared schema modules live under `lib/ai/schemas/`:

- `core.ts` defines shared enums for research mode, risk level, source class, evidence role, model role, and model capability.
- `route.ts` defines `RoutePlan`, `CoordinatorDecision`, and `EvidenceItem` schemas.
- `review.ts` defines `SourceQualityAssessment` and `AdvisorFinding` schemas.
- `index.ts` provides explicit exports for the shared contracts.

The schemas use Zod so the runtime can validate model-produced structured outputs before trusting them.

## Added model capability module

The new capability module lives at `lib/models/capabilities.ts`.

It introduces:

- `ModelCapabilityProfile` for normalized model capability metadata;
- provider default capability inference;
- model-specific capability inference;
- role requirement checks through `modelSupportsRole()`;
- missing-capability reporting through `getMissingCapabilitiesForRole()`;
- a compatibility bridge for the existing search-selection path through `isModelSearchCapable()`.

## Existing behavior preserved

The existing `lib/models/compatibility.ts` API remains intact. Existing callers can keep using:

```ts
isSearchCompatibleModel(providerId, modelId)
```

Internally, that function now routes through the capability profile layer. NVIDIA remains intentionally restricted to the known search-compatible instruct patterns from the previous implementation.

## Why this matters

The current researcher is still prompt-orchestrated. Before adding a real Router or Coordinator, the project needs shared contracts for:

- what a route decision is;
- what model role requirements are;
- what evidence metadata must contain;
- what source-quality scoring can return;
- what advisor findings look like;
- which models can safely serve which internal role.

These are the seams that later make the AI architecture portable and library-ready.

## Tests added

This slice adds tests for:

- route plan defaults and validation;
- evidence-item metadata requirements;
- source-quality and advisor schema defaults;
- provider default capability inference;
- configured model capability normalization;
- NVIDIA search-compatibility preservation;
- role support and missing capability reporting.

## Remaining Phase AI-2 work

This slice is intentionally additive. Remaining work before the Router/Coordinator phase:

- Integrate role capability checks into model selection for internal roles beyond search retrieval.
- Add explicit model-role selection helpers for Router, Coordinator, Advisor, Citation Verifier, and Repair.
- Add prompt-output parsers that use these schemas without exposing private reasoning.
- Add trace-safe validation errors for failed structured outputs.
- Decide which schema package boundaries should survive a future monorepo/library extraction.

## Monorepo/library checkpoint

Do not extract a separate AI architecture library yet. The right checkpoint is after Phase AI-3 or AI-4, once these schemas are used by at least Router/Coordinator and Source Quality code paths.

Extraction becomes reasonable when:

- the shared schemas are stable across more than one internal role;
- model capability routing is used outside normal chat model selection;
- tests prove the contracts work independently of Next.js route handlers;
- the package boundary can avoid importing app, UI, cookies, server-only runtime code, or provider secrets.
