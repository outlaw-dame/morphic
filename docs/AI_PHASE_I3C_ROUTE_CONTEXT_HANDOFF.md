# Phase AI-I3C: Router Execution Context Handoff

## Status

Implemented for the chat streaming and researcher boundaries. The permanent CI and review gates must pass before merge.

## Purpose

AI-I3C prevents the canonical Router decision from being reduced to an execution-mode toggle. The verified route plan and its SHA-256 digest are now carried into downstream execution as a tamper-evident `RouteExecutionContext`.

## Integrity boundary

`createRouteExecutionContext()`:

1. parses the route through the canonical `RoutePlanSchema`;
2. validates the digest format;
3. recomputes SHA-256 over recursively canonicalized route serialization with sorted object keys;
4. rejects mismatched or malformed input;
5. recursively freezes the route and every nested collection before returning the context.

Router admission and execution verification use the same shared digest function. Equivalent schema-valid route objects therefore produce the same digest regardless of object-key insertion order, while any value mutation invalidates the digest. Nested route arrays cannot be modified after context creation.

## Propagation

The verified context is required by authenticated and ephemeral stream configurations. It is propagated into:

- authenticated and guest trace metadata;
- stream-start message metadata;
- researcher construction;
- researcher telemetry;
- deterministic execution guidance.

The raw route is not accepted from client request fields. It is created only from the server-side admission result.

## Researcher guidance

The researcher receives generated, structured requirements covering:

- canonical mode and risk;
- maximum tool-call budget;
- freshness requirements;
- entity-grounding requirements;
- source-quality requirements;
- Fusion requirements;
- Advisor requirements;
- citation-verification requirements;
- required source classes;
- disallowed source classes;
- required model roles;
- route digest.

The guidance explicitly states that the answer model may not weaken the canonical route. It contains policy facts only and does not expose hidden reasoning.

## Scope boundary

This phase establishes the handoff required for Coordinator enforcement but does not falsely claim that post-retrieval Coordinator policy evaluation is complete. The existing Coordinator requires evidence state, completed roles, contradiction state, freshness state, and entity-grounding results. Those inputs will be connected in the next slice.

Wikidata and DBpedia execution also remains a later entity-grounding stage. AI-I3C ensures that an entity-sensitive route cannot silently lose its grounding requirement before that stage is wired.

## Tests

Coverage includes:

- valid route/digest acceptance;
- key-order-independent canonical digests;
- route tampering rejection;
- digest tampering rejection;
- recursive immutability of nested route collections;
- deterministic generated guidance;
- required freshness, Advisor, and citation instructions;
- propagation through live stream configuration and researcher metadata via repository type and integration checks.
