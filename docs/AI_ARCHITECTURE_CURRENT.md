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

## Historical document handling

Old documents remain in place. They should not be bulk-rewritten or deleted.

Permitted maintenance:

- add a short non-destructive status banner linking to this entrypoint and the crosswalk;
- fix broken links or narrowly scoped factual errata;
- record supersession of future sequencing without changing the document's original claims;
- preserve original scope, non-goals, validation statements, and security boundaries.

Prohibited maintenance:

- rewriting an old phase so it appears to have implemented later work;
- deleting still-useful requirements because a new roadmap exists;
- using an old phase number as proof of live integration;
- silently changing completion criteria or role authority.

## Current repository decision — July 12, 2026

AI-I0, AI-I1, and AI-I2 are implemented in isolation. Substantial Router, Coordinator handoff, retrieval, Composer, Advisor, Citation Verifier, deterministic release, governed response, and rollout-boundary slices have also merged, but the canonical dependency chain is not complete and production enablement is not claimed.

Before additional canonical implementation phases proceed, repository cleanup and reconciliation are mandatory:

1. close stale or superseded parallel PRs;
2. preserve unique runtime and rollout work on a clean branch from current `main`;
3. remove reused AI-I3K/AI-I3L labels from future completion accounting;
4. distinguish historical AI-13 conflict repair hints from canonical AI-I13 research trace and privacy controls;
5. reconcile the phase registry, crosswalk, implementation status, and merged PR evidence;
6. verify the complete CI matrix on the cleanup branch before merge.

After cleanup, the next incomplete canonical dependency is AI-I5 Fusion planning and bounded retrieval execution. AI-I13 is not the next implementation phase and remains dependent on AI-I3, AI-I4, AI-I5, AI-I7, AI-I10, AI-I11, and AI-I12.

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
