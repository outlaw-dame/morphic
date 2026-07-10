# Current AI Architecture Documentation

This file is the entrypoint for Morphic's current AI architecture and implementation plan.

## Read in this order

1. [AI Research Architecture](./AI_ARCHITECTURE.md) — target architecture and doctrine.
2. [AI Architecture Implementation Reconciliation](./AI_ARCHITECTURE_IMPLEMENTATION_RECONCILIATION.md) — strict comparison of documentation, isolated code, live integration, enforcement, and production status.
3. [AI Architecture Integration Roadmap V2](./AI_ARCHITECTURE_INTEGRATION_ROADMAP_V2.md) — canonical future implementation order and exit criteria.
4. [Original AI Architecture Integration Phases](./AI_ARCHITECTURE_INTEGRATION_PHASES.md) — historical roadmap retained for context; its phase numbering must not be used to infer current completion.
5. Individual `AI_PHASE_*` documents — descriptions of merged implementation slices with their original scope and boundaries.

## Current decision

The previously proposed AI-27 restricted PostgreSQL integration is not the next coding phase.

The next coding phase is **AI-I0: Canonical contracts and phase reconciliation** from the V2 roadmap. It establishes lifecycle and role-execution contracts plus machine-readable implementation status before any live Router, Coordinator, model-role, entity-provider, repair-execution, or database wiring proceeds.

## Completion terminology

- **Documented** does not mean implemented.
- **Scaffolded** does not mean invoked.
- **Implemented in isolation** does not mean integrated.
- **Integrated** does not mean enforced.
- **Enforced** does not mean production-enabled.

Future documentation and PR descriptions must use these terms accurately.
