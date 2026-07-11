# Current AI Architecture Documentation

This file is the entrypoint for Morphic's current AI architecture and implementation plan.

## Read in this order

1. [AI Research Architecture](./AI_ARCHITECTURE.md) — enduring target architecture and doctrine.
2. [AI Architecture Implementation Reconciliation](./AI_ARCHITECTURE_IMPLEMENTATION_RECONCILIATION.md) — strict comparison of documentation, isolated code, live integration, enforcement, and production status.
3. [AI Architecture Phase Crosswalk and Drift Controls](./AI_ARCHITECTURE_PHASE_CROSSWALK.md) — requirement-preservation map from every original phase and historical implementation slice into the canonical V2 sequence.
4. [AI Architecture Integration Roadmap V2](./AI_ARCHITECTURE_INTEGRATION_ROADMAP_V2.md) — canonical future implementation order and exit criteria.
5. [Original AI Architecture Integration Phases](./AI_ARCHITECTURE_INTEGRATION_PHASES.md) — retained source requirements and historical roadmap; use the crosswalk to determine completion and future mapping.
6. Individual `AI_PHASE_*` documents — immutable implementation records of merged slices, their exact scope, validation, and boundaries.

## Documentation authority

The documents have complementary authority rather than replacing one another:

- `AI_ARCHITECTURE.md` controls enduring doctrine and role boundaries.
- The crosswalk preserves every beneficial old requirement and records whether it is completed, still open, strengthened, or historical.
- The V2 roadmap controls future sequencing and completion accounting.
- Historical phase documents prove what an individual merged slice actually implemented; their old phase number does not prove broader end-to-end integration.

No old requirement is removed merely because a newer roadmap exists. Removal requires an explicit rejected disposition, rationale, threat analysis, and architecture decision record.

## Current decision

The previously proposed AI-27 restricted PostgreSQL integration is not the next coding phase.

The next coding phase is **AI-I0: Canonical contracts and phase reconciliation** from the V2 roadmap. It establishes lifecycle and role-execution contracts, a machine-readable implementation-status registry, crosswalk validation, and architecture invariant tests before any live Router, Coordinator, model-role, entity-provider, repair-execution, or database wiring proceeds.

## Completion terminology

- **Documented** does not mean implemented.
- **Scaffolded** does not mean invoked.
- **Implemented in isolation** does not mean integrated.
- **Integrated** does not mean enforced.
- **Enforced** does not mean production-enabled.

Future documentation and PR descriptions must use these terms accurately.

## Drift prevention

Future AI architecture changes must:

- use stable `AI-I*` identifiers without silent renumbering;
- update the machine-readable phase registry, crosswalk, roadmap, and affected code in the same PR;
- map old requirements and reused implementation slices explicitly;
- preserve deterministic safety policy as the non-waivable floor;
- include exact implementation and test evidence before advancing status;
- use an ADR for material role, authority, privacy, retry, persistence, entity-provider, or rollout changes.