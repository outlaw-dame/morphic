# Phase AI-I3L — Production Governed Runtime Factory

## Status

Implementation in progress on `agent/ai-i3l-production-adapter-factory`.

## Purpose

AI-I3K established a single governed production-chain facade and a disabled-by-default rollout decision. AI-I3L adds the server-owned construction boundary for that facade.

The runtime factory is responsible for constructing the retrieval, Composer, optional Advisor, and Citation Verifier ports exactly once from trusted server configuration. Request payloads cannot supply or replace these ports.

## Invariants

1. One execution ID is shared by Composer, Advisor, and Citation Verifier.
2. Every model role receives a distinct invocation ID.
3. Composer and Advisor receive only the `none` permission class.
4. Citation Verifier receives only `evidence_read_only`.
5. Retrieval is wrapped by the hardened production retrieval adapter.
6. Candidate lists must be non-empty.
7. Provider `invoke` methods must be own data properties; inherited or accessor-backed methods are rejected.
8. Deadlines are finite and bounded between one second and ten minutes.
9. The factory exposes one `run()` method that delegates to the canonical governed-chain facade.
10. The rollout flag remains disabled by default and is not enabled by this phase.

## Current scope boundary

This phase does not yet:

- read model/provider configuration from cookies or request bodies;
- enable governed production rollout;
- replace the existing stream response implementation;
- add Wikidata or DBpedia execution;
- change persistence or analytics behavior.

The next slice must connect this server-owned runtime factory to concrete repository retrieval/model-provider construction, then integrate the released response into the existing authenticated and guest streaming/persistence paths behind the server-only rollout policy.
