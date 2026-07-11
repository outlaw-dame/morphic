# Phase AI-I1: Model Registry and Role-Selection Policy V2

## Status

Implemented in isolation. This phase does not replace live model selection and does not invoke models.

## Purpose

AI-I1 converts model selection from provider-name and model-name heuristics into a fail-closed, provenance-aware policy boundary. It preserves the useful legacy capability inference implemented in original AI-2A, but inferred claims remain explicitly weak and cannot satisfy hard role requirements when deployment-configured or evaluation-verified provenance is required.

## Canonical model identity

A model is identified by the provider-qualified pair `providerId/modelId`. Bare model IDs may be accepted in compatibility fallback lists, but provider-qualified identifiers take precedence and should be used for new configuration.

Duplicate provider-qualified identities are rejected during registry normalization.

## Capability provenance

Capability assertions carry one of these ordered provenance levels:

1. `unknown`
2. `inferred`
3. `provider_declared`
4. `model_card_declared`
5. `deployment_configured`
6. `evaluation_verified`

Multiple assertions for the same capability are reduced deterministically to the strongest provenance. Legacy capability strings are normalized only as `inferred`; they are never silently promoted.

## Role-quality evidence

Role eligibility requires role-specific evaluation evidence containing:

- role;
- score from zero through one;
- fixture version;
- verification timestamp.

Each role profile defines a minimum score and maximum evidence age. Missing, malformed, stale, or below-threshold evidence fails eligibility.

## Canonical role profiles

`role-profiles-v2.ts` defines exactly one policy for every canonical model role:

- Router;
- Coordinator;
- Fusion Planner;
- Retriever;
- Source Quality;
- Entity Grounding;
- Answer Composer;
- Advisor;
- Citation Verifier;
- Repair.

Each profile specifies hard and preferred capabilities, reliability, context, latency, cost, locality, provenance and role-quality thresholds, structured-output strategy, fallback ordering, and tool-permission class.

Router and Coordinator have no tool permission. Retriever, Entity Grounding, Citation Verifier, Fusion Planner, and Repair receive role-specific bounded permission-class declarations; AI-I2 must enforce those declarations at the common role runner.

## Eligibility and ranking

A candidate is excluded when any hard requirement fails:

- malformed structure or nested assertions;
- disabled, deprecated, or unavailable deployment;
- active cooldown;
- prohibited locality;
- reliability below minimum;
- insufficient context;
- latency or cost above the configured ceiling;
- missing capability;
- insufficient capability provenance;
- missing, stale, or inadequate role-quality evidence.

Eligible candidates are ranked deterministically by:

1. explicit fallback order;
2. requested family diversity;
3. verified role quality;
4. preferred capability coverage;
5. reliability;
6. latency;
7. cost;
8. provider-qualified lexical identity.

Selection never mutates caller arrays.

## Failure and fallback behavior

Malformed external candidates are rejected before property access. The selector returns:

- `selected` when a candidate satisfies all requirements;
- `deterministic_fallback` only when the caller declares a deterministic implementation for the role;
- `no_eligible_model` otherwise.

AI-I1 does not silently select a weaker model, bypass a privacy restriction, ignore cooldown, or relax quality requirements.

## Compatibility

The original capability inference module remains available for legacy callers. AI-I1 does not claim that those callers use V2 selection. Live migration occurs only in later integration phases through the common role runner and role-specific admission phases.

## Security and privacy boundaries

- Model-controlled input cannot grant tool permissions.
- Tool permission classes come from canonical role profiles.
- Authenticated owner and execution scope are not model-registry fields.
- Candidate parsing rejects accessors, symbols, hostile prototypes, cycles, unknown fields, and oversized graphs through the AI-I0 contract boundary.
- Errors do not include model configuration payloads or secrets.
- Local-only routes cannot select remote candidates when their profile is restricted to local execution.

## Tests

Tests cover:

- complete role-profile coverage;
- non-executing Router and Coordinator permissions;
- bounded permission classes for tool-adjacent roles;
- provenance precedence;
- inferred legacy capabilities remaining weak;
- malformed candidate fail-closed behavior;
- stale role-quality evidence;
- availability, privacy/locality, cooldown, cost, latency, reliability and quality gates;
- provider-qualified fallback ordering;
- family diversity;
- deterministic selection and input immutability;
- duplicate model identity rejection;
- accessor rejection without invocation;
- explicit deterministic-fallback and no-model outcomes.

## Completion criteria

AI-I1 is complete only when repository tests, type checking, lint, formatting, native configuration verification, and production build all pass on the final non-diagnostic branch head. Temporary formatter, diagnostic, error-capture, and fix-artifact workflows must not remain in the pull-request diff.

## Next phase

AI-I2 will implement the common hardened role runner. It must consume canonical V2 profiles and normalized registry candidates, enforce permission classes outside model control, bind trusted execution scope, apply timeout and cancellation policy, validate role outputs, and produce AI-I0 role-execution records.
