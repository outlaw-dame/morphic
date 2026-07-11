# Phase AI-I3K — Controlled Production Wiring

## Objective

Wire the governed research chain into the production chat stream without weakening the existing Router admission boundary or exposing unapproved drafts.

## Required ordering

1. authenticated request validation
2. Router admission and immutable route context
3. governed retrieval
4. Coordinator evaluation and bounded repair
5. evidence-only composition
6. route-mandated Advisor review
7. evidence-bound Citation Verifier
8. deterministic final-release authorization
9. one-time authorization consumption
10. response streaming

No governed draft may reach a client before step 9 succeeds.

## Rollout boundary

The governed path must be guarded by one server-controlled rollout policy. Client input, model output, query text, headers, or request metadata must not be able to enable or bypass it.

The initial policy is fail-closed:

- disabled by default unless explicitly enabled in trusted server configuration;
- when enabled, only Router routes requiring research may enter the governed chain;
- quick non-research requests continue through the existing quick path;
- governed-chain failure must not silently fall back to the legacy combined research/composition agent;
- cancellation must propagate without conversion into an ordinary provider failure;
- rollout decisions and release outcomes must be observable without recording private query or evidence content.

## Security invariants

- all adapters share one trusted execution ID;
- role permissions remain bounded by the AI-I2 runner;
- retrieval cannot compose;
- Composer cannot retrieve;
- Advisor cannot retrieve, rewrite, or release;
- Citation Verifier cannot retrieve, rewrite, or release;
- only a consumed AI-I3J authorization exposes the draft;
- release authorization is single-use and short-lived;
- no client-controlled feature flag;
- no legacy-path fallback after governed execution begins;
- no Wikidata/DBpedia call unless the route requires entity grounding and the entity provider boundary is explicitly configured.

## Required tests

- rollout disabled preserves the existing production path;
- rollout enabled routes research through the governed chain;
- quick non-research requests do not invoke governed adapters;
- retrieval, Coordinator, composition, Advisor, Citation Verifier, and release execute in order;
- required Advisor routes cannot skip Advisor;
- failures before release emit no approved draft content;
- authorization is consumed exactly once;
- cancellation stops the chain;
- forged or stale release authorization cannot stream;
- no fallback to the legacy combined agent after governed execution starts;
- telemetry contains only bounded identifiers and reason codes.

## Scope boundary

This phase wires the already implemented governed components and controlled rollout policy. It does not add new model roles, change Router policy, enable knowledge-graph providers, or remove the legacy path. Removing the legacy governed-research path requires a later rollout-completion phase after production evidence is available.
