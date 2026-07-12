# Phase AI-I3K: Governed Production Streaming Rollout

## Status

Implementation begins from corrected `main` commit `462014850cfc46ee0805bea6c8b33115549287d9`, following merged AI-I3J.

## Objective

Introduce explicit, deterministic, fail-closed rollout controls before replacing the legacy combined researcher stream with the governed retrieval → Coordinator → Composer → Advisor → Citation Verifier → deterministic release chain.

## AI-I3K-A scope

This first slice implements the rollout authority and live request boundary:

1. Parse one canonical `off`, `shadow`, or `enforce` mode.
2. Select cohorts deterministically from a privacy-safe opaque key, route digest, and server-controlled salt.
3. Reject malformed percentages, missing or weak salts, unsupported modes, and malformed cohort inputs.
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
- Invalid configuration fails closed before model selection or streaming.
- Rollout metadata contains no prompt, draft, evidence, email, IP address, or raw user identifier.

## Environment contract

- `AI_GOVERNED_STREAM_MODE`: `off`, `shadow`, or `enforce`; defaults to `off`.
- `AI_GOVERNED_STREAM_PERCENT`: integer `0` through `100`; required for non-off modes.
- `AI_GOVERNED_STREAM_SALT`: server-only secret with at least 32 characters when percentage is greater than zero.

## Follow-on

AI-I3K-B must construct the production governed executor, consume the one-time AI-I3J authorization immediately before streaming the approved draft, preserve persistence and cancellation semantics, and add rollback and observability tests. AI-I3K-A deliberately does not claim that executor is live.