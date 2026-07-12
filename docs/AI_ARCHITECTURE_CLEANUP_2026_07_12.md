# AI Architecture Repository Cleanup — July 12, 2026

## Purpose

This record reconciles stale parallel branches and reused phase labels before additional canonical AI implementation proceeds.

## Pull-request cleanup

- PR #86 was closed as superseded. It was 140 commits behind `main`; PR #88 contains the clean governed two-stage Coordinator pipeline replacement.
- PR #95 was closed without merge. It was 66 commits behind `main`; its unique production governed-runtime factory was ported to a clean branch and its unresolved null-provider validation defect was fixed with regression coverage.
- PR #102 was already closed without merge. Its unique centralized stream execution authority was recovered on the clean branch so quick, legacy, shadow, and enforced behavior have one tested decision boundary.
- PR #99 remains open because it contains the canonical AI-I5A Fusion Planner work. It must not be merged until cleanup is complete and it is recreated or rebased safely onto current `main`.

## Canonical mapping

Historical phase names and canonical V2 phase identifiers are distinct.

- Historical AI-13 Conflict Repair Hints was completed in PR #55.
- Canonical AI-I13 Research Trace, Observability, and Privacy remains open.
- Production Fusion Planner work maps to AI-I5.
- Shadow and staged rollout work maps to AI-I16.
- Runtime assembly and release-stream boundaries are implementation slices supporting multiple later canonical phases; they must not be counted as completion of AI-I3.

## Preserved runtime work

The cleanup branch preserves two unique, still-useful boundaries from stale or closed PRs:

1. A server-owned production governed-runtime factory that binds retrieval, Composer, optional Advisor, and Citation Verifier adapters to one execution with separate invocation identities and least-privilege permission classes.
2. A centralized governed stream executor that selects quick, legacy, shadow, or governed execution, prevents fallback after enforced governed failure, keeps shadow output secret, isolates telemetry failure, and preserves cancellation.

Neither boundary enables rollout by itself. Production flags remain default-off and canonical dependency completion is not claimed.

## Validation requirements

Before merge, the cleanup PR must pass:

- type checking;
- format checking;
- lint;
- tests;
- native configuration verification;
- production build;
- review-thread reconciliation.

## Work ordering after cleanup

1. Finish AI-I5 Fusion planning and bounded retrieval execution.
2. Complete AI-I6 evidence-ingestion completeness.
3. Complete AI-I7 mandatory entity grounding and Wikidata/DBpedia routing.
4. Complete AI-I8 source-quality and evidence-admission enforcement.
5. Reconcile and complete AI-I9 Composer, AI-I10 Advisor, and AI-I11 Citation Verifier integration against the admitted evidence path.
6. Complete AI-I12 bounded repair execution and re-verification.
7. Implement AI-I13 structured research traces and privacy controls.
8. Implement AI-I14 end-to-end architecture evaluations.
9. Complete AI-I15 restricted PostgreSQL operations.
10. Complete AI-I16 shadow thresholds, canaries, rollback, and staged rollout.
11. Complete AI-I17 production enforcement and legacy-path removal.
12. Make the AI-I18 extraction decision.
