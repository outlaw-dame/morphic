# Phase AI-I3K — Controlled Production Wiring

## Objective

Wire the governed research chain into production streaming without weakening the existing Router, Coordinator, role-runner, evidence, Advisor, Citation Verifier, or deterministic release invariants.

## Required ordering

1. Auth and request validation.
2. Canonical Router admission and immutable route context.
3. Rollout-policy decision.
4. Governed retrieval and bounded repair.
5. Coordinator approval.
6. Evidence-only composition.
7. Advisor review when route-mandated.
8. Citation verification.
9. Deterministic one-time release authorization.
10. Release consumption immediately before user-visible streaming.

No governed draft may be emitted before step 10.

## Rollout policy

The production wiring must be controlled by a server-side policy that is independent of caller-controlled request fields. The policy supports `disabled`, `shadow`, and `enforced`.

- `disabled`: preserve the current production path.
- `shadow`: execute governed validation without exposing its draft; failures are recorded but do not replace the legacy response.
- `enforced`: only a successfully consumed deterministic release may be emitted.

The default is `disabled` unless an explicit validated server configuration enables another mode.

## Safety invariants

- Quick non-research chat remains on the existing quick path.
- Only Router-governed research routes are eligible.
- Guest and authenticated execution use the same policy semantics.
- Rollout selection is deterministic, privacy-preserving, and not based on raw user identifiers.
- Configuration is strictly parsed and fails closed to `disabled`.
- Shadow execution cannot expose governed drafts or alter the legacy stream.
- Enforced execution cannot fall back to ungoverned output after a governed failure.
- Cancellation propagates through every stage.
- Production release authorization is consumed exactly once and immediately before emission.
- No user-controlled prompt or model output may change rollout mode.

## Required tests

- invalid configuration defaults to disabled;
- caller-controlled fields cannot enable rollout;
- deterministic cohort assignment;
- quick-chat bypass;
- shadow mode never exposes governed draft;
- enforced mode emits only a consumed release;
- governed failure in enforced mode fails closed;
- cancellation prevents release;
- guest and authenticated policy parity;
- release replay is rejected.

## Scope boundary

This phase wires the existing governed chain and rollout policy. It does not add Wikidata/DBpedia execution, new retrieval providers, or new model roles. Those remain separately reviewable integrations.
