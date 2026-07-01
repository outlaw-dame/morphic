# AI Architecture Schema Notes

This note captures schema consistency fixes raised during review of the AI architecture docs.

Companion documents:

- [AI Research Architecture](./AI_ARCHITECTURE.md)
- [AI Role Prompts](./AI_ROLE_PROMPTS.md)
- [AI Architecture Gap Audit](./AI_ARCHITECTURE_GAP_AUDIT.md)
- [AI Architecture Integration Phases](./AI_ARCHITECTURE_INTEGRATION_PHASES.md)

## Canonical schema policy

When implementation begins, the canonical schema source should live in code, not duplicated prose blocks.

Recommended path:

```text
lib/ai-architecture/schemas/
  route.ts
  source.ts
  evidence.ts
  entity.ts
  advisor.ts
  verification.ts
  trace.ts
  index.ts
```

Docs may repeat short excerpts for readability, but implementation must import canonical schema definitions from code.

## SourceClass

`SourceClass` should have one canonical implementation definition.

Docs that describe source quality should reference the canonical schema rather than maintaining a second independent union that can drift.

## ClaimType

`ClaimType` must be a standalone reusable type because it is referenced by both `SourceQualityAssessment` and `AtomicClaim`.

Canonical shape:

```ts
type ClaimType =
  | 'definition'
  | 'current_fact'
  | 'historical_fact'
  | 'statistic'
  | 'causal_claim'
  | 'recommendation'
  | 'legal_claim'
  | 'medical_claim'
  | 'financial_claim'
  | 'safety_claim'
  | 'experience_report'
  | 'opinion'
```

`AtomicClaim` should then use:

```ts
type AtomicClaim = {
  id: string
  text: string
  claimType: ClaimType
  supportLevel: 'supports' | 'partially_supports' | 'contradicts' | 'not_enough_information'
  evidenceIds: string[]
}
```

## Advisor pass case

`AdvisorFinding[]` should use an empty array for a clean pass.

Do not emit a note-level finding just to say the answer passed unless the schema adds an explicit pass/no-issue variant. This avoids schema-invalid findings with fake `issue` or `repairInstruction` values.

## Repair role

`repairer` should be a first-class model role.

The `ModelRole.role` union should include:

```ts
| 'repairer'
```

`RoutePlan.modelAssignments` should include:

```ts
repairer?: ModelRole
```

This keeps the Repair Agent routable and prevents implementers from wiring a prompt that the model selection schema cannot represent.

## PR #33 review alignment notes

The integration phases document is the canonical implementation sequence. The shorter roadmap in `AI_ARCHITECTURE.md` is only a high-level architecture summary and must not be used as the phase-number source of truth. When implementation work is planned, use `AI_ARCHITECTURE_INTEGRATION_PHASES.md` phase IDs, not the abbreviated roadmap labels in `AI_ARCHITECTURE.md`.

`ModelRole` must be included in Phase AI-2 shared schemas because it is required by `RoutePlan.modelAssignments`. Implementers should place it in the route schema module with `ResearchMode`, `RiskLevel`, and `RoutePlan`.

Phase AI-6 must refactor existing Wikidata and DBpedia lookup logic from `lib/entities/knowledge-graph.ts` into dedicated modules such as `wikidata-client.ts` and `dbpedia-client.ts`; it should not rebuild those clients from scratch unless the existing implementation is proven inadequate.

Phase AI-12 must start from the existing `lib/claims/evidence-verification.ts` implementation, including its claim extraction, cited-source resolution, evidence classification, and answer-claim verification behavior. The phase should refactor, extend, or migrate that implementation into the new architecture instead of creating duplicate greenfield verification modules.

## Implementation reminder

Phase AI-2 in the integration phases document should create the canonical schemas before Router, Coordinator, Advisor, Verifier, or Repair Agent logic is implemented.
