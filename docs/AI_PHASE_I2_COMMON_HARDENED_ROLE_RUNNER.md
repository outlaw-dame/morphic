# Phase AI-I2: Common Hardened Role Runner

## Status

Implemented in isolation. AI-I2 does not replace or enable any live model invocation path.

## Purpose

AI-I2 defines one provider-neutral invocation boundary for every canonical AI role. It consumes AI-I1 model candidates and role profiles, binds trusted execution scope outside model control, validates all external data through the AI-I0 contract boundary, enforces limits and permissions, and produces canonical AI-I0 execution request/result records.

## Trusted execution scope and IDOR resistance

Callers must obtain a `TrustedRoleExecutionScope` through `createTrustedRoleExecutionScope`. The factory validates and copies owner, execution, invocation, deadline, and permission data into a frozen object registered in a private `WeakSet`.

The runner rejects structurally identical, copied, deserialized, or model-produced scope objects before provider access. The trusted owner scope is passed to the provider adapter from this branded object and is never sourced from role input, prompt text, model output, or candidate metadata.

This is an in-process authorization witness, not a replacement for service-layer authentication or database row-level security. Live admission phases must create scopes only after authenticating the owner and authorizing the execution.

## Contract and hostile-object boundary

Role inputs, model candidates, provider response envelopes, and role outputs pass through `parseArchitectureContract` before schema evaluation. This rejects:

- accessors and getters without invoking them;
- symbol and non-enumerable properties;
- hostile prototypes;
- cycles;
- non-finite numbers;
- excessive depth and object graph size;
- unknown fields where role schemas are strict.

Provider and validation failures use coarse failure classes and reason codes. Raw prompts, model responses, provider errors, owner identifiers, and configuration payloads are not copied into error messages.

## Model selection

The runner uses the canonical AI-I1 role profile and `selectModelForRoleV2`. It does not accept a caller-supplied profile, preventing callers or models from relaxing:

- capability provenance requirements;
- quality thresholds and freshness;
- locality/privacy policy;
- reliability, context, latency, and cost limits;
- tool permission classes;
- fallback ordering.

Selected models are recorded using provider-qualified identity. Identities that exceed the AI-I0 execution-record limit fail closed before invocation.

## Tool permissions

Tool permission classes are a closed enum:

- `none`;
- `retrieval_plan_only`;
- `bounded_retrieval`;
- `entity_resolution_only`;
- `evidence_read_only`;
- `draft_repair_only`.

The required class comes only from the canonical AI-I1 role profile. The trusted execution scope must explicitly grant that class. The adapter receives the resolved class but no model-controlled tool grant.

AI-I2 does not itself execute tools. Later live phases must map each class to a capability-limited adapter and must not expose broader tools than the class permits.

## Timeouts and cancellation

Every invocation has a trusted absolute deadline. The runner:

- rejects elapsed deadlines before provider access;
- rejects deadlines more than ten minutes in the future;
- creates a bounded abort signal for each provider attempt;
- races the provider promise against cancellation and timeout;
- returns even when a provider ignores abort signals;
- removes listeners and timers after each attempt.

Caller cancellation is classified as `cancelled`; deadline exhaustion is classified as `timeout`.

## Retry policy

The default is one attempt.

A transient provider failure may be retried only when all of the following are true:

1. the canonical permission class is `none`;
2. the caller explicitly declares the operation idempotent;
3. the configured attempt limit is at most three;
4. the trusted deadline still permits the delay and next attempt.

Backoff is exponential and capped. Tool-bearing roles are never automatically retried, preventing duplicate retrieval, mutation, or repair side effects.

Unknown errors and permanent provider failures are never retried.

## Input and output limits

The runner enforces:

- total static prompt plus canonical input bytes;
- canonical output bytes;
- provider-reported output tokens;
- schema versions;
- strict role input/output schemas.

Malformed, accessor-backed, oversized, over-token, or schema-incompatible output is rejected and never returned as a successful role result.

## Execution records

Every admitted run produces a validated `RoleExecutionRequest`. Every completed, failed, cancelled, or timed-out admitted run produces a validated `RoleExecutionResult` containing only bounded metadata, digests, failure classes, and reason codes.

Successful outputs receive a SHA-256 digest. The output itself remains separate from the execution record.

Scope branding failures and invalid runner configuration throw generic local errors before an execution request can be safely constructed. These are programmer/admission failures, not provider execution results.

## Deterministic fallback

A role may provide an explicit deterministic fallback. It runs under the same trusted scope, deadline, cancellation, input schema, output schema, and output-byte validation. It does not invoke the provider adapter and records a null selected-model identity.

The existence of a fallback must be declared by trusted caller code; model output cannot create one.

## Tests

The AI-I2 test suite covers:

- trusted scope and owner/execution binding;
- copied-scope and forged-scope rejection;
- hostile input and candidate accessors without invocation;
- canonical permission enforcement;
- malformed, accessor-backed, oversized, and over-token output;
- bounded exponential retry for tool-free idempotent calls;
- prohibition on automatic retries for tool-bearing roles;
- cancellation and deadline races against uncooperative providers;
- deterministic fallback validation;
- pre-invocation input-budget enforcement;
- canonical request/result records and output digests.

## Non-goals and deployment boundary

AI-I2 does not:

- wire any existing live role to the runner;
- create provider SDK adapters;
- persist execution records;
- authorize users or create trusted scopes at an HTTP boundary;
- execute retrieval or mutation tools;
- enable production traffic.

Those integrations begin with AI-I3 and subsequent role-admission phases. Production enablement remains prohibited until the later evaluation, restricted persistence, shadow rollout, and enforcement phases are complete.

## Next phase

AI-I3 will implement live Router admission. It must preserve the deterministic Router as the non-waivable floor and fallback, create trusted scopes only after authorization, invoke the model Router through AI-I2, validate route output, and merge it through a versioned deterministic policy without allowing the model to remove mandatory safety or privacy routes.
