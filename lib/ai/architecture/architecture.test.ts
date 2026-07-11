import { describe, expect, it } from 'vitest'

import { ModelRoleSchema } from '@/lib/ai/schemas'

import {
  AI_ARCHITECTURE_CONTRACT_VERSION,
  AI_INTEGRATION_PHASE_IDS,
  AI_PHASE_REGISTRY,
  CoordinatorLifecycleStateSchema,
  CoordinatorTransitionSchema,
  EntityProviderResultSchema,
  FinalReleaseDecisionSchema,
  getLegalCoordinatorTransitions,
  InvalidArchitectureContractError,
  isLegalCoordinatorTransition,
  isTerminalCoordinatorState,
  parseArchitectureContract,
  RoleExecutionRequestSchema,
  RoleExecutionResultSchema,
  ToolBudgetLedgerSchema,
  validateAIPhaseRegistry
} from './index'

const executionId = 'execution_scope_123456'
const invocationId = 'invocation_scope_1234'
const now = '2026-07-11T00:00:00.000Z'

function validRoleRequest() {
  return {
    version: AI_ARCHITECTURE_CONTRACT_VERSION,
    executionId,
    invocationId,
    role: 'router',
    inputSchemaVersion: 1,
    outputSchemaVersion: 1,
    promptVersion: 'router-v1',
    selectedModelId: null,
    contextDigest: 'sha256:0123456789abcdef',
    deadlineAt: now,
    maxInputBytes: 10_000,
    maxOutputBytes: 10_000,
    maxOutputTokens: 2_000,
    reasonCodes: ['deterministic_floor']
  } as const
}

describe('canonical AI architecture contracts', () => {
  it('parses bounded versioned role execution contracts', () => {
    const request = parseArchitectureContract(
      RoleExecutionRequestSchema,
      validRoleRequest()
    )
    const result = parseArchitectureContract(RoleExecutionResultSchema, {
      version: 1,
      executionId,
      invocationId,
      role: 'router',
      status: 'succeeded',
      outputSchemaVersion: 1,
      promptVersion: 'router-v1',
      selectedModelId: null,
      startedAt: now,
      completedAt: now,
      outputDigest: 'sha256:fedcba9876543210',
      failureClass: null,
      reasonCodes: ['validated_output']
    })

    expect(request.role).toBe('router')
    expect(result.status).toBe('succeeded')
  })

  it('rejects unknown versions and extra privileged fields', () => {
    expect(() =>
      parseArchitectureContract(RoleExecutionRequestSchema, {
        ...validRoleRequest(),
        version: 2
      })
    ).toThrow(InvalidArchitectureContractError)

    expect(() =>
      parseArchitectureContract(RoleExecutionRequestSchema, {
        ...validRoleRequest(),
        authenticatedOwnerScope: 'attacker-controlled'
      })
    ).toThrow(InvalidArchitectureContractError)
  })

  it('rejects accessors, symbols, class instances, cycles, and sparse arrays', () => {
    let getterCalled = false
    const accessor = { ...validRoleRequest() }
    Object.defineProperty(accessor, 'selectedModelId', {
      enumerable: true,
      get() {
        getterCalled = true
        return 'unsafe'
      }
    })
    expect(() =>
      parseArchitectureContract(RoleExecutionRequestSchema, accessor)
    ).toThrow(InvalidArchitectureContractError)
    expect(getterCalled).toBe(false)

    const symbolValue = { ...validRoleRequest(), [Symbol('secret')]: true }
    expect(() =>
      parseArchitectureContract(RoleExecutionRequestSchema, symbolValue)
    ).toThrow(InvalidArchitectureContractError)

    class HostileRequest {}
    expect(() =>
      parseArchitectureContract(
        RoleExecutionRequestSchema,
        Object.assign(new HostileRequest(), validRoleRequest())
      )
    ).toThrow(InvalidArchitectureContractError)

    const cyclic: Record<string, unknown> = { ...validRoleRequest() }
    cyclic.self = cyclic
    expect(() =>
      parseArchitectureContract(RoleExecutionRequestSchema, cyclic)
    ).toThrow(InvalidArchitectureContractError)

    const sparse = new Array(2)
    sparse[1] = 'reason'
    expect(() =>
      parseArchitectureContract(RoleExecutionRequestSchema, {
        ...validRoleRequest(),
        reasonCodes: sparse
      })
    ).toThrow(InvalidArchitectureContractError)
  })

  it('enforces result, budget, and release invariants', () => {
    expect(() =>
      RoleExecutionResultSchema.parse({
        version: 1,
        executionId,
        invocationId,
        role: 'router',
        status: 'failed',
        outputSchemaVersion: 1,
        promptVersion: 'router-v1',
        selectedModelId: null,
        startedAt: now,
        completedAt: now,
        outputDigest: null,
        failureClass: null,
        reasonCodes: []
      })
    ).toThrow()

    expect(() =>
      RoleExecutionResultSchema.parse({
        version: 1,
        executionId,
        invocationId,
        role: 'router',
        status: 'succeeded',
        outputSchemaVersion: 1,
        promptVersion: 'router-v1',
        selectedModelId: null,
        startedAt: now,
        completedAt: now,
        outputDigest: null,
        failureClass: null,
        reasonCodes: ['validated_output']
      })
    ).toThrow()

    expect(() =>
      ToolBudgetLedgerSchema.parse({
        version: 1,
        executionId,
        maxToolCalls: 1,
        usedToolCalls: 2,
        maxRetrievalPaths: 1,
        usedRetrievalPaths: 0,
        maxModelCalls: 1,
        usedModelCalls: 0,
        deadlineAt: now
      })
    ).toThrow()

    expect(() =>
      FinalReleaseDecisionSchema.parse({
        version: 1,
        executionId,
        decision: 'release',
        routeDigest: 'sha256:0123456789abcdef',
        evidenceGraphDigest: 'sha256:0123456789abcdef',
        draftDigest: null,
        verificationDigest: null,
        reasonCodes: ['release_allowed'],
        decidedAt: now
      })
    ).toThrow()
  })

  it('requires consistent Wikidata and DBpedia result provenance', () => {
    for (const provider of ['wikidata', 'dbpedia'] as const) {
      const parsed = EntityProviderResultSchema.parse({
        version: 1,
        executionId,
        provider,
        mentionId: 'mention_scope_1234567',
        status: 'not_found',
        canonicalIds: [],
        resultDigest: null,
        retrievedAt: now,
        failureClass: null,
        reasonCodes: ['no_candidate']
      })
      expect(parsed.provider).toBe(provider)
    }

    expect(() =>
      EntityProviderResultSchema.parse({
        version: 1,
        executionId,
        provider: 'wikidata',
        mentionId: 'mention_scope_1234567',
        status: 'succeeded',
        canonicalIds: [],
        resultDigest: 'sha256:0123456789abcdef',
        retrievedAt: now,
        failureClass: null,
        reasonCodes: ['resolved']
      })
    ).toThrow()

    expect(() =>
      EntityProviderResultSchema.parse({
        version: 1,
        executionId,
        provider: 'dbpedia',
        mentionId: 'mention_scope_1234567',
        status: 'not_found',
        canonicalIds: ['https://dbpedia.org/resource/Unexpected'],
        resultDigest: null,
        retrievedAt: now,
        failureClass: null,
        reasonCodes: ['no_candidate']
      })
    ).toThrow()
  })
})

describe('AI architecture drift controls', () => {
  it('keeps one complete ordered phase registry', () => {
    expect(AI_PHASE_REGISTRY.map(entry => entry.id)).toEqual([
      ...AI_INTEGRATION_PHASE_IDS
    ])
    expect(validateAIPhaseRegistry()).toEqual([])
  })

  it('keeps the common runner mapped to every canonical model role', () => {
    const runnerPhase = AI_PHASE_REGISTRY.find(entry => entry.id === 'AI-I2')
    expect(runnerPhase?.requiredRoles).toEqual([...ModelRoleSchema.options])
    expect(ModelRoleSchema.options).toContain('fusion_planner')
  })

  it('detects duplicate identifiers, forward dependencies, and missing entity providers', () => {
    const duplicate = [AI_PHASE_REGISTRY[0], AI_PHASE_REGISTRY[0]]
    expect(validateAIPhaseRegistry(duplicate)).toContain('duplicate_phase_id')

    const forwardDependency = AI_PHASE_REGISTRY.map(entry => ({ ...entry }))
    forwardDependency[0] = {
      ...forwardDependency[0],
      dependencies: ['AI-I1']
    }
    expect(validateAIPhaseRegistry(forwardDependency)).toContain(
      'forward_dependency'
    )

    const missingProviders = AI_PHASE_REGISTRY.map(entry => ({ ...entry }))
    const entityIndex = missingProviders.findIndex(
      entry => entry.id === 'AI-I7'
    )
    missingProviders[entityIndex] = {
      ...missingProviders[entityIndex],
      historicalRequirements: [
        {
          source: 'Entity grounding',
          disposition: 'carried_forward',
          rationale: 'Canonical provider routing remains required.'
        }
      ]
    }
    expect(validateAIPhaseRegistry(missingProviders)).toContain(
      'missing_entity_provider_requirement'
    )
  })
})

describe('Coordinator lifecycle contract', () => {
  it('defines transitions for every lifecycle state', () => {
    for (const state of CoordinatorLifecycleStateSchema.options) {
      expect(getLegalCoordinatorTransitions(state)).toBeDefined()
    }
  })

  it('allows only declared transitions and keeps terminal states immutable', () => {
    expect(isLegalCoordinatorTransition('created', 'routed')).toBe(true)
    expect(isLegalCoordinatorTransition('created', 'released')).toBe(false)

    for (const terminal of [
      'released',
      'refused_or_caveated',
      'cancelled',
      'failed'
    ] as const) {
      expect(isTerminalCoordinatorState(terminal)).toBe(true)
      expect(getLegalCoordinatorTransitions(terminal)).toEqual([])
    }
  })

  it('parses revision-bound transition metadata', () => {
    const parsed = CoordinatorTransitionSchema.parse({
      version: 1,
      executionId,
      expectedRevision: 0,
      from: 'created',
      to: 'routed',
      eventId: 'event_scope_123456789',
      occurredAt: now,
      reasonCodes: ['route_validated']
    })
    expect(parsed.to).toBe('routed')
  })
})
