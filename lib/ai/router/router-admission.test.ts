import { describe, expect, it, vi } from 'vitest'

import type { RoleProviderAdapter } from '@/lib/ai/role-runner'
import type { ResearchMode } from '@/lib/ai/schemas'

import {
  admitResearchRoute,
  buildDeterministicRouteFloor,
  mergeRouterProposal,
  type RouterModelProposal
} from './router-admission'

function proposal(
  overrides: Partial<RouterModelProposal> = {}
): RouterModelProposal {
  return {
    mode: 'quick',
    riskLevel: 'low',
    requiresResearch: false,
    requiredSourceClasses: [],
    disallowedSourceClasses: [],
    needsFreshness: false,
    needsEntityGrounding: false,
    needsSourceQuality: false,
    needsFusionPlanning: false,
    needsAdvisorReview: false,
    needsCitationVerification: false,
    maxToolCalls: 100,
    reasonCodes: ['model_classification'],
    ...overrides
  }
}

function routerCandidate(): Record<string, unknown> {
  return {
    providerId: 'provider-a',
    modelId: 'router-model',
    family: 'router-family',
    availability: 'available',
    locality: 'remote',
    reliability: 'strong',
    maxContextTokens: 16_000,
    estimatedLatencyMs: 100,
    estimatedCostPerMillionTokensUsd: 1,
    capabilities: [
      {
        capability: 'structured_output',
        provenance: 'deployment_configured'
      },
      {
        capability: 'reasoning',
        provenance: 'model_card_declared'
      }
    ],
    roleQuality: [
      {
        role: 'router',
        score: 0.99,
        fixtureVersion: 'router-fixture-v1',
        verifiedAt: new Date().toISOString()
      }
    ],
    cooldownUntil: null
  }
}

function adapter(
  output: RouterModelProposal
): RoleProviderAdapter<
  Readonly<{ query: string; requestedMode: ResearchMode | null }>
> {
  return {
    invoke: vi.fn(async () => ({ output, outputTokens: 100 }))
  }
}

describe('AI-I3 Router admission', () => {
  it('keeps explicit non-research chat on a bounded quick bypass', () => {
    const route = buildDeterministicRouteFloor({ query: 'Hello!' })

    expect(route.requiresResearch).toBe(false)
    expect(route.mode).toBe('quick')
    expect(route.requiredModelRoles).toEqual(['router'])
    expect(route.maxToolCalls).toBe(10)
  })

  it('promotes an explicit non-research query when a research mode is requested', () => {
    const route = buildDeterministicRouteFloor({
      query: 'Hello!',
      requestedMode: 'deep'
    })

    expect(route.mode).toBe('deep')
    expect(route.requiresResearch).toBe(true)
    expect(route.needsCitationVerification).toBe(true)
    expect(route.requiredModelRoles).toEqual(
      expect.arrayContaining([
        'router',
        'retriever',
        'answer_composer',
        'citation_verifier',
        'repair'
      ])
    )
  })

  it('does not allow requested quick mode to downgrade high-risk policy', () => {
    const route = buildDeterministicRouteFloor({
      query: 'Give me current legal advice about an insurance settlement',
      requestedMode: 'quick'
    })

    expect(route.mode).toBe('critical')
    expect(route.riskLevel).toBe('high')
    expect(route.needsFreshness).toBe(true)
    expect(route.needsSourceQuality).toBe(true)
    expect(route.needsFusionPlanning).toBe(true)
    expect(route.needsAdvisorReview).toBe(true)
    expect(route.needsCitationVerification).toBe(true)
    expect(route.requiredModelRoles).toEqual(
      expect.arrayContaining([
        'router',
        'fusion_planner',
        'retriever',
        'source_quality',
        'advisor',
        'citation_verifier',
        'repair',
        'answer_composer'
      ])
    )
  })

  it.each([
    'Who is the current CEO of Acme?',
    'Which company owns Instagram?',
    'Tell me about the renamed product Alpha One',
    'Find the paper with DOI 10.1000/example',
    'Compare the Paris repository with Paris the city',
    'Who founded OpenAI?'
  ])('requires entity grounding for entity-sensitive query: %s', query => {
    const route = buildDeterministicRouteFloor({ query })

    expect(route.needsEntityGrounding).toBe(true)
    expect(route.needsFusionPlanning).toBe(true)
    expect(route.requiredModelRoles).toContain('entity_grounding')
  })

  it('enforces deployment caps before model classification', () => {
    const route = buildDeterministicRouteFloor({
      query: 'What is the latest weather forecast?',
      deploymentMaxToolCalls: 7
    })

    expect(route.maxToolCalls).toBe(7)
  })

  it('merges model output monotonically and never expands the floor budget', () => {
    const floor = buildDeterministicRouteFloor({
      query: 'Who is the current president and what legal powers do they have?'
    })
    const merged = mergeRouterProposal(floor, proposal())

    expect(merged.mode).toBe(floor.mode)
    expect(merged.riskLevel).toBe(floor.riskLevel)
    expect(merged.requiresResearch).toBe(true)
    expect(merged.needsFreshness).toBe(true)
    expect(merged.needsEntityGrounding).toBe(true)
    expect(merged.needsSourceQuality).toBe(true)
    expect(merged.needsFusionPlanning).toBe(true)
    expect(merged.needsAdvisorReview).toBe(true)
    expect(merged.needsCitationVerification).toBe(true)
    expect(merged.maxToolCalls).toBe(floor.maxToolCalls)
  })

  it('promotes research requirements when the model proposes a research mode', () => {
    const floor = buildDeterministicRouteFloor({ query: 'Hello!' })
    const merged = mergeRouterProposal(
      floor,
      proposal({ mode: 'deep', requiresResearch: false })
    )

    expect(merged.mode).toBe('deep')
    expect(merged.requiresResearch).toBe(true)
    expect(merged.needsCitationVerification).toBe(true)
    expect(merged.requiredModelRoles).toEqual(
      expect.arrayContaining([
        'retriever',
        'answer_composer',
        'citation_verifier',
        'repair'
      ])
    )
  })

  it('allows the model to add stricter requirements and reduce budget', () => {
    const floor = buildDeterministicRouteFloor({ query: 'Explain photosynthesis' })
    const merged = mergeRouterProposal(
      floor,
      proposal({
        mode: 'deep',
        riskLevel: 'medium',
        requiresResearch: true,
        requiredSourceClasses: ['academic_or_peer_reviewed'],
        needsSourceQuality: true,
        needsFusionPlanning: true,
        needsAdvisorReview: true,
        maxToolCalls: 5,
        reasonCodes: ['subtle_complexity']
      })
    )

    expect(merged.mode).toBe('deep')
    expect(merged.riskLevel).toBe('medium')
    expect(merged.maxToolCalls).toBe(5)
    expect(merged.requiredSourceClasses).toContain(
      'academic_or_peer_reviewed'
    )
    expect(merged.reasonCodes).toContain('subtle_complexity')
  })

  it('prevents model-required sources from re-enabling deterministically disallowed classes', () => {
    const floor = buildDeterministicRouteFloor({ query: 'Research a current topic' })
    const merged = mergeRouterProposal(
      floor,
      proposal({
        requiresResearch: true,
        requiredSourceClasses: ['content_farm', 'official_source']
      })
    )

    expect(merged.requiredSourceClasses).not.toContain('content_farm')
    expect(merged.requiredSourceClasses).toContain('official_source')
    expect(merged.disallowedSourceClasses).toContain('content_farm')
  })

  it('keeps generated rationale within the canonical schema bound', () => {
    const floor = buildDeterministicRouteFloor({ query: 'Explain photosynthesis' })
    const longCodes = Array.from(
      { length: 16 },
      (_, index) => `reason_${index}_${'x'.repeat(110)}`
    )
    const merged = mergeRouterProposal(
      floor,
      proposal({ reasonCodes: longCodes })
    )

    expect(merged.rationale.length).toBeLessThanOrEqual(2048)
    expect(merged.rationale.startsWith('Router admission reasons: ')).toBe(true)
  })

  it('invokes the configured Router through the hardened role runner and binds scope', async () => {
    const modelAdapter = adapter(
      proposal({
        mode: 'deep',
        requiresResearch: true,
        needsFusionPlanning: true,
        maxToolCalls: 8
      })
    )

    const result = await admitResearchRoute({
      input: { query: 'Explain photosynthesis' },
      ownerScopeId: 'owner_scope_00000001',
      executionId: 'execution_00000001',
      invocationId: 'invocation_0000001',
      model: {
        candidates: [routerCandidate()],
        adapter: modelAdapter
      }
    })

    expect(result.modelProposalApplied).toBe(true)
    expect(result.modelExecution?.result.status).toBe('succeeded')
    expect(result.routePlan.mode).toBe('deep')
    expect(result.routeDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(modelAdapter.invoke).toHaveBeenCalledTimes(1)
    expect(vi.mocked(modelAdapter.invoke).mock.calls[0]?.[0]).toMatchObject({
      ownerScopeId: 'owner_scope_00000001',
      executionId: 'execution_00000001',
      invocationId: 'invocation_0000001',
      role: 'router',
      permissionClass: 'none'
    })
  })

  it('falls back to the deterministic floor when the Router model is malformed', async () => {
    const malformedAdapter: RoleProviderAdapter<
      Readonly<{ query: string; requestedMode: ResearchMode | null }>
    > = {
      invoke: vi.fn(async () => ({ output: { mode: 'quick' }, outputTokens: 2 }))
    }

    const result = await admitResearchRoute({
      input: { query: 'Who is the current CEO of Acme?' },
      ownerScopeId: 'owner_scope_00000001',
      executionId: 'execution_00000001',
      invocationId: 'invocation_0000001',
      model: {
        candidates: [routerCandidate()],
        adapter: malformedAdapter
      }
    })

    expect(result.modelProposalApplied).toBe(false)
    expect(result.modelExecution?.result.failureClass).toBe('malformed_output')
    expect(result.routePlan).toEqual(result.deterministicFloor)
    expect(result.routePlan.needsEntityGrounding).toBe(true)
  })

  it('returns immutable route data', () => {
    const route = buildDeterministicRouteFloor({ query: 'Latest OpenAI release' })

    expect(Object.isFrozen(route)).toBe(true)
    expect(() => {
      ;(route as { maxToolCalls: number }).maxToolCalls = 99
    }).toThrow()
  })
})
