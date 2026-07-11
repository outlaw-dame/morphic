# Phase AI-I3B: Live Router Admission Boundary

## Status

Implemented for the production chat entrypoint and pending CI and review.

## Purpose

AI-I3B makes canonical Router admission mandatory before any governed chat execution begins. The route order is now:

1. parse the request and validate its trigger-specific minimum fields;
2. authenticate and apply the existing guest boundary;
3. derive a bounded user query from the submitted message or latest user message during regeneration;
4. run canonical Router admission;
5. map the canonical route to the currently supported execution mode;
6. apply adaptive authentication and rate-limit policy to the Router-promoted mode;
7. select a model and start streaming only after successful admission.

## Canonical versus execution modes

The canonical Router supports `quick`, `adaptive`, `deep`, and `critical`. The existing production researcher currently exposes `quick` and `adaptive` execution paths.

The integration therefore maps:

- `quick` to quick execution;
- `adaptive`, `deep`, and `critical` to adaptive execution.

This mapping is monotonic. It never maps a stronger canonical route to quick execution. The full canonical route remains available internally for later Coordinator and role-stage enforcement.

## Query extraction

Admission input is derived without trusting arbitrary request fields:

- submissions use bounded text content from the submitted user message;
- regeneration uses the latest user-role message in the supplied history;
- non-text message parts are ignored;
- missing, blank, or oversized queries fail with a `400` response before model selection.

## Scope binding

Each admission receives fresh execution and invocation identifiers. Authenticated owner scope is represented by an HMAC-derived pseudonymous identifier rather than the raw user identifier. The binding key uses an explicitly configured AI/auth secret when available and otherwise uses a process-local random key. Guest scope is request-unique.

No raw user identifier is placed in Router model input or route metadata.

## Safety properties

- Router admission occurs before model selection, tools, research, or streaming.
- A quick-mode cookie is only a preference and cannot weaken Router policy.
- Router-promoted adaptive execution is subject to the existing cloud authentication gate.
- Router-promoted adaptive execution is charged against the existing adaptive rate limit.
- Regeneration cannot bypass admission.
- The current integration uses the deterministic Router floor. Provider-backed Router proposals remain disabled until a deployment-derived candidate and provider adapter can be proven safe without circular model selection.
- Wikidata and DBpedia are not called by the Router boundary; the route records when later entity grounding is required.

## Tests

Coverage includes:

- text-part extraction;
- exclusion of non-text parts;
- latest-user-message regeneration extraction;
- missing and oversized query rejection;
- canonical-to-execution mode mapping;
- quick-preference promotion for current entity-sensitive queries;
- explicit non-research quick execution;
- pseudonymous authenticated scope binding;
- route digest generation.

## Remaining work

The next integration slice must pass the canonical route and digest into the Coordinator/execution context, derive Router model candidates from deployment configuration, and add a provider adapter only if it can run without selecting the answer model before admission. Entity-sensitive routes must later invoke bounded Wikidata/DBpedia grounding before composition.
