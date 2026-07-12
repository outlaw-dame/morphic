# Phase AI-I16A: Governed Production Streaming Rollout Boundary

## Canonical mapping

This implementation slice belongs to canonical **Phase AI-I16: Shadow integration and staged rollout** in `AI_ARCHITECTURE_INTEGRATION_ROADMAP_V2.md`.

The implementation was originally developed under the temporary label AI-I3K-A. That label is retained only as historical PR context and is not the canonical phase identity.

## Status

The rollout-control boundary was merged in PR #100 at `549c102b399f670defa0c6de3e70222c81348f20`.

The rollout defaults to `off`. The full governed executor is not yet production-enabled.

## Objective

Introduce explicit, deterministic, fail-closed rollout controls before replacing the legacy combined researcher stream with the governed retrieval → Coordinator → Composer → Advisor → Citation Verifier → deterministic release chain.

## AI-I16A scope

This first rollout slice implements the rollout authority and live request boundary:

1. Parse one canonical `off`, `shadow`, or `enforce` mode.
2. Select cohorts deterministically from a privacy-safe opaque key, route digest, and server-controlled salt.
3. Reject malformed active-rollout percentages, missing or weak salts, unsupported modes, and malformed active cohort inputs.
4. Preserve the legacy stream only for `off`, non-selected cohorts, and selected `shadow` cohorts.
5. Fail closed when an `enforce` cohort is selected before a governed release authorization is available; never silently fall back to the legacy researcher.
6. Propagate only non-sensitive rollout metadata into stream tracing and stream-start metadata.
7. Keep the default mode `off`.

## Security invariants

- Client input cannot choose rollout mode, percentage, salt, or cohort assignment.
- Cohort selection uses SHA-256 over a server-controlled salt, an opaque cohort key, and the canonical route digest.
- Raw user identifiers and salts are never returned or emitted as telemetry.
- Percentage is an integer from 0 through 100.
- `shadow` never changes the user-visible answer and cannot authorize release.
- `enforce` may never invoke the legacy researcher for a selected cohort.
- Invalid active configuration fails closed before model selection or streaming.
- Rollout with percentage `0` does not depend on unused cohort inputs or salts. `off` mode with a stale nonzero percentage remains an invalid active configuration and still requires a valid salt.
- Rollout metadata contains no prompt, draft, evidence, email, IP address, or raw user identifier.
- Authenticated and guest streaming entrypoints both require the canonical rollout decision and independently enforce it.
- A selected `enforce` request returns a controlled service-unavailable response until a later AI-I16 slice supplies and consumes a valid AI-I3J release authorization.

## Environment contract

- `AI_GOVERNED_STREAM_MODE`: `off`, `shadow`, or `enforce`; defaults to `off`.
- `AI_GOVERNED_STREAM_PERCENT`: integer `0` through `100`; required for non-off modes.
- `AI_GOVERNED_STREAM_SALT`: server-only secret with at least 32 characters when percentage is greater than zero.

## Completion evidence

AI-I16A passed tests, type checking, lint, formatting, native configuration verification, production build, and review. No temporary diagnostic workflow remained in the merged diff.

## Follow-on constraints

Do not proceed directly to production enforcement merely because the rollout authority exists. The remaining canonical integration phases and AI-I16 shadow thresholds must be satisfied first. A later AI-I16 slice must construct the production governed executor, consume the one-time AI-I3J authorization immediately before streaming the approved draft, preserve persistence and cancellation semantics, and add rollback and observability tests.
