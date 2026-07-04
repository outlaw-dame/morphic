# AI Phase 3 Prompt Governance

This document records the first implementation slice of Phase AI-3 after the Phase AI-2 schema, capability, and role-selection work landed.

Companion documents:

- [AI Research Architecture](./AI_ARCHITECTURE.md)
- [AI Architecture Integration Phases](./AI_ARCHITECTURE_INTEGRATION_PHASES.md)
- [AI Architecture Schema Notes](./AI_ARCHITECTURE_SCHEMA_NOTES.md)
- [AI Phase 2 Shared Schemas and Model Capabilities](./AI_PHASE_2_SCHEMAS_AND_CAPABILITIES.md)
- [AI Role Prompts](./AI_ROLE_PROMPTS.md)

## Scope

Phase AI-3 turns the role-prompt documentation into versioned code-level prompt definitions and parser utilities. This phase does not replace the existing researcher agent or search-mode prompts. It creates the governed prompt layer that later Router, Coordinator, Source Quality, Advisor, Citation Verifier, and Repair implementations can consume.

## Added prompt governance modules

The new modules live under `lib/ai/prompts/`:

- `role-prompts.ts` defines versioned prompt metadata for every `ModelRole`.
- `role-output-parsers.ts` validates structured role outputs against Phase AI-2 schemas.
- `index.ts` exports the prompt governance API.

Each prompt definition includes:

- role;
- version;
- description;
- system prompt;
- expected output contract.

## Added output parser behavior

`parseRoleOutput(role, output)` validates model-produced structured outputs before downstream code trusts them. It returns either a successful parsed value or a bounded validation summary with schema paths and messages.

The validation summary is designed for application traces and diagnostics. It should not include raw model scratch work, prompt internals, or user-visible explanation text.

## Why this matters

The current researcher remains prompt-orchestrated. Before adding a real Router or Coordinator, the project needs:

- one governed registry for internal role prompts;
- prompt versions that can be traced and changed intentionally;
- role-output validation that fails closed before downstream code trusts model output;
- tests that prove every `ModelRole` has prompt metadata;
- parser behavior that is safe for diagnostics by design.

## Tests added

This slice adds tests for:

- one prompt definition per `ModelRole`;
- prompt version metadata;
- prompt output contracts;
- valid route-plan parsing;
- bounded invalid-output errors;
- advisor finding array parsing.

## What stays unchanged

This phase intentionally does not change:

- `lib/agents/prompts/search-mode-prompts.ts`;
- the current researcher agent execution flow;
- model selection for user-facing chat responses;
- the answer rendering layer;
- existing search/fetch/feed tools.

## Remaining Phase AI-3 work

Before moving to the Router implementation phase, follow-up work should:

- add parser adapters for entity grounding and draft-answer contracts once those schemas exist;
- wire prompt versions into role execution metadata when the first role runner is introduced;
- add role-runner scaffolding that combines role prompt, role model selection, and parser validation;
- decide whether prompt text should remain in TypeScript constants or move to external prompt assets before monorepo extraction.

## Next phase

After Phase AI-3 prompt governance is in place, the next implementation phase should be Phase AI-4 Router implementation. The Router should use:

- `RoutePlanSchema`;
- `getRolePrompt('router')`;
- `selectModelForRole(models, 'router')`;
- `parseRoleOutput('router', output)`.
