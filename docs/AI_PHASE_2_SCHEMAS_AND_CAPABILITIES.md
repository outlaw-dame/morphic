# AI Phase 2 Shared Schemas and Model Capabilities

This document records the implementation slices of Phase AI-2 after the Phase AI-0/AI-1 safety baseline landed.

Companion documents:

- [AI Research Architecture](./AI_ARCHITECTURE.md)
- [AI Architecture Integration Phases](./AI_ARCHITECTURE_INTEGRATION_PHASES.md)
- [AI Architecture Schema Notes](./AI_ARCHITECTURE_SCHEMA_NOTES.md)
- [AI Phase 0 Baseline and Safety Inventory](./AI_PHASE_0_BASELINE_AND_SAFETY.md)

## Scope

Phase AI-2 starts turning the architecture documents into stable code contracts. The goal of these slices is not to replace the current researcher agent yet. The goal is to add shared typed primitives and role-aware model-selection helpers that Router, Coordinator, Fusion, Source Quality, Entity Grounding, Advisor, Citation Verifier, and later library extraction can reuse.

## Added schema modules

The shared schema modules live under `lib/ai/schemas/`:

- `core.ts` defines shared enums for research mode, risk level, source class, evidence role, model role, and model capability.
- `route.ts` defines `RoutePlan`, `CoordinatorDecision`, and `EvidenceItem` schemas.
- `review.ts` defines `SourceQualityAssessment` and `AdvisorFinding` schemas.
- `index.ts` provides explicit exports for the shared contracts.

The schemas use Zod so the runtime can validate model-produced structured outputs before trusting them.

## Added model capability module

The capability module lives at `lib/models/capabilities.ts`.

It introduces:

- `ModelCapabilityProfile` for normalized model capability metadata;
- provider default capability inference;
- model-specific capability inference;
- role requirement checks through `modelSupportsRole()`;
- missing-capability reporting through `getMissingCapabilitiesForRole()`;
- a compatibility bridge for the existing search-selection path through `isModelSearchCapable()`.

## Added model role-selection helper

The role-selection helper lives at `lib/models/role-selection.ts`.

It introduces:

- `getModelRoleCandidate()` for pairing a model with its inferred capability profile;
- `partitionModelsForRole()` for separating eligible and rejected models for a given internal AI role;
- `selectModelForRole()` for choosing the best eligible model while retaining rejected-model diagnostics;
- deterministic candidate sorting by reliability, capability breadth, provider id, and model id.

This helper is intentionally separate from `lib/utils/model-selection.ts`. The existing model-selection code chooses the user-facing chat/search model using cookies, cloud/local deployment mode, provider enablement, and fallback model logic. The new role-selection helper is a lower-level internal primitive for later Router, Coordinator, Advisor, Citation Verifier, and Repair code paths.

## Existing behavior preserved

The existing `lib/models/compatibility.ts` API remains intact. Existing callers can keep using:

```ts
isSearchCompatibleModel(providerId, modelId)
```

Internally, that function now routes through the capability profile layer. NVIDIA remains intentionally restricted to the known search-compatible instruct patterns from the previous implementation, while non-NVIDIA search compatibility preserves the legacy behavior.

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

This phase adds tests for:

- route plan defaults and validation;
- evidence-item metadata requirements;
- source-quality and advisor schema defaults;
- provider default capability inference;
- configured model capability normalization;
- NVIDIA search-compatibility preservation;
- role support and missing capability reporting;
- role-specific model selection;
- rejected-candidate diagnostics;
- non-mutating candidate sorting.

## Remaining Phase AI-2 work

This phase remains intentionally additive. Remaining work before the Router/Coordinator phase:

- Integrate role capability checks into the first Router/Coordinator implementation path.
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
