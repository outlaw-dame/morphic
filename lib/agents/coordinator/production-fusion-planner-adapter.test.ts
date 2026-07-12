import { describe, expect, it, vi } from 'vitest'

import {
  createRouteExecutionContext,
  digestRoutePlan
} from '@/lib/ai/router/execution-context'
import { buildDeterministicRouteFloor } from '@/lib/ai/router/router-admission'
import { parseRoutePlan, type SourceClass } from '@/lib/ai/schemas'
import {
  createTrustedRoleExecutionScope,
  type RoleProviderAdapter
} from '@/lib/ai/role-runner'

import {
  createProductionFusionPlanner,
  type FusionPlannerModelInput
} from './production-fusion-planner-adapter'

const query = 'Research who founded Example Corp and what changed recently.'

function context(value: string = query) {
  const floor = buildDeterministicRouteFloor({ query: value })
  const routePlan = parseRoutePlan({
    ...floor,
    needsFusionPlanning: value !== 'Hello',
    needsFreshness: value !== 'Hello',
    needsEntityGrounding: value !== 'Hello',
    requiredSourceClasses: [],
    disallowedSourceClasses: ['content_farm', 'scraper_or_aggregator'],
    mode: value === 'Hello' ? 'quick' : 'deep',
    maxToolCalls: value === 'Hello' ? 1 : 8
  })
  return createRouteExecutionContext({
    routePlan,
    routeDigest: digestRoutePlan(routePlan)
  })
}

function scope(invocationId = 'fusion_invocation_0001') {
  return createTrustedRoleExecutionScope({
    ownerScopeId: 'owner_scope_00000001',
    executionId: 'execution_00000001',
    invocationId,
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    allowedPermissionClasses: ['retrieval_plan_only']
  })
}

function candidate(providerId = 'provider-a') {
  return {
    providerId,
    modelId: `${providerId}-fusion-model`,
    family: `${providerId}-fusion-family`,
    availability: 'available',
    locality: 'remote',
    reliability: 'strong',
    maxContextTokens: 64_000,
    estimatedLatencyMs: 100,
    estimatedCostPerMillionTokensUsd: 1,
    capabilities: [
      { capability: 'structured_output', provenance: 'deployment_configured' },
      { capability: 'reasoning', provenance: 'model_card_declared' }
    ],
    roleQuality: [
      {
        role: 'fusion_planner',
        score: 0.99,
        fixtureVersion: 'fusion-fixture-v1',
        verifiedAt: new Date().toISOString()
      }
    ],
    cooldownUntil: null
  }
}

const DIVERSE_CLASSES: readonly SourceClass[] = [
  'official_source',
  'government_or_regulator',
  'academic_or_peer_reviewed',
  'established_news',
  'specialist_publication',
  'wiki_or_knowledge_graph'
]

function validOutput(input: FusionPlannerModelInput) {
  const classes: SourceClass[] = [...input.requiredSourceClasses]
  for (const sourceClass of DIVERSE_CLASSES) {
    if (
      classes.length >= 4 ||
      classes.includes(sourceClass) ||
      input.disallowedSourceClasses.includes(sourceClass)
    ) {
      continue
    }
    classes.push(sourceClass)
  }

  return {
    paths: classes.slice(0, input.maxToolCalls).map((sourceClass, index) => ({
      id: `path_${index + 1}`,
      query: `Example Corp evidence lane ${index + 1} ${sourceClass}`,
      sourceClass,
      purpose:
        index === 0
          ? ('entity_disambiguation' as const)
          : index === 1
            ? ('freshness_check' as const)
            : index === 2
              ? ('independent_corroboration' as const)
              : ('primary_evidence' as const),
      maxResults: 5,
      requiresFreshness: index === 1
    })),
    reasonCodes: ['independent_paths_required']
  }
}

function planner(
  provider: RoleProviderAdapter<FusionPlannerModelInput>,
  providerId = 'provider-a',
  invocationId = 'fusion_invocation_0001'
) {
  return createProductionFusionPlanner({
    scope: scope(invocationId),
    candidates: [candidate(providerId)],
    provider
  })
}

describe('AI-I5 production Fusion Planner adapter', () => {
  it('runs through retrieval_plan_only and returns bounded immutable paths', async () => {
    const provider: RoleProviderAdapter<FusionPlannerModelInput> = {
      invoke: vi.fn(async invocation => {
        expect(invocation.role).toBe('fusion_planner')
        expect(invocation.permissionClass).toBe('retrieval_plan_only')
        expect(invocation.input).not.toHaveProperty('tools')
        expect(invocation.input).not.toHaveProperty('searchResults')
        expect(Object.isFrozen(invocation.input)).toBe(true)
        return { output: validOutput(invocation.input), outputTokens: 100 }
      })
    }

    const result = await planner(provider).plan({ query, routeContext: context() })

    expect(result.paths).toHaveLength(4)
    expect(new Set(result.paths.map(path => path.sourceClass)).size).toBe(4)
    expect(Object.isFrozen(result.paths)).toBe(true)
    expect(result.roleExecution.role).toBe('fusion_planner')
    expect(provider.invoke).toHaveBeenCalledTimes(1)
  })

  it('normalizes OpenRouter-like and direct providers into one canonical plan contract', async () => {
    const directProvider: RoleProviderAdapter<FusionPlannerModelInput> = {
      invoke: async invocation => ({
        output: validOutput(invocation.input),
        outputTokens: 100
      })
    }
    const openRouterLikeProvider: RoleProviderAdapter<FusionPlannerModelInput> = {
      invoke: async invocation => ({
        output: validOutput(invocation.input),
        outputTokens: 100
      })
    }
    const routeContext = context()

    const [direct, openRouterLike] = await Promise.all([
      planner(
        directProvider,
        'provider-a',
        'fusion_direct_000001'
      ).plan({ query, routeContext }),
      planner(
        openRouterLikeProvider,
        'openrouter',
        'fusion_openrouter_001'
      ).plan({ query, routeContext })
    ])

    expect(openRouterLike.routeDigest).toBe(direct.routeDigest)
    expect(openRouterLike.paths).toEqual(direct.paths)
    expect(openRouterLike.reasonCodes).toEqual(direct.reasonCodes)
    expect(openRouterLike.roleExecution.selectedModelId).not.toBe(
      direct.roleExecution.selectedModelId
    )
  })

  it('rejects routes that do not authorize Fusion before provider invocation', async () => {
    const provider = { invoke: vi.fn() }
    await expect(
      planner(provider).plan({ query: 'Hello', routeContext: context('Hello') })
    ).rejects.toThrow('Router did not authorize Fusion Planner execution.')
    expect(provider.invoke).not.toHaveBeenCalled()
  })

  it('rejects duplicate semantic queries', async () => {
    await expect(
      planner({
        invoke: async invocation => {
          const output = validOutput(invocation.input)
          return {
            output: {
              ...output,
              paths: output.paths.map((path, index) => ({
                ...path,
                query: index < 2 ? ' SAME   QUERY ' : path.query
              }))
            },
            outputTokens: 100
          }
        }
      }).plan({ query, routeContext: context() })
    ).rejects.toThrow('Fusion Planner execution failed: malformed_output.')
  })

  it('rejects disallowed source classes and omitted mandatory lanes', async () => {
    await expect(
      planner({
        invoke: async invocation => ({
          output: {
            ...validOutput(invocation.input),
            paths: [
              {
                id: 'blocked_path',
                query: 'blocked content farm source',
                sourceClass: 'content_farm',
                purpose: 'entity_disambiguation',
                maxResults: 5,
                requiresFreshness: true
              }
            ]
          },
          outputTokens: 100
        })
      }).plan({ query, routeContext: context() })
    ).rejects.toThrow('Fusion Planner selected disallowed source class')

    await expect(
      planner({
        invoke: async invocation => {
          const output = validOutput(invocation.input)
          return {
            output: {
              ...output,
              paths: output.paths.map(path => ({
                ...path,
                purpose:
                  path.purpose === 'entity_disambiguation'
                    ? ('background_context' as const)
                    : path.purpose
              }))
            },
            outputTokens: 100
          }
        }
      }).plan({ query, routeContext: context() })
    ).rejects.toThrow('Fusion Planner omitted the required entity path.')
  })

  it('rejects insufficient diversity and community over-influence', async () => {
    await expect(
      planner({
        invoke: async () => ({
          output: {
            paths: [0, 1, 2].map(index => ({
              id: `same_class_${index}`,
              query: `different query ${index}`,
              sourceClass: 'official_source',
              purpose:
                index === 0
                  ? ('entity_disambiguation' as const)
                  : index === 1
                    ? ('freshness_check' as const)
                    : ('primary_evidence' as const),
              maxResults: 5,
              requiresFreshness: index === 1
            })),
            reasonCodes: []
          },
          outputTokens: 100
        })
      }).plan({ query, routeContext: context() })
    ).rejects.toThrow('minimum source diversity')

    await expect(
      planner({
        invoke: async invocation => {
          const output = validOutput(invocation.input)
          return {
            output: {
              ...output,
              paths: [
                ...output.paths,
                {
                  id: 'community_one',
                  query: 'community experience one',
                  sourceClass: 'forum_or_reddit',
                  purpose: 'community_experience',
                  maxResults: 5,
                  requiresFreshness: false
                },
                {
                  id: 'community_two',
                  query: 'community experience two',
                  sourceClass: 'social_media',
                  purpose: 'community_experience',
                  maxResults: 5,
                  requiresFreshness: false
                }
              ]
            },
            outputTokens: 100
          }
        }
      }).plan({ query, routeContext: context() })
    ).rejects.toThrow('community-source influence cap')
  })

  it('preserves cancellation during provider invocation without retry', async () => {
    const controller = new AbortController()
    const provider: RoleProviderAdapter<FusionPlannerModelInput> = {
      invoke: vi.fn(async () => {
        controller.abort(new Error('user cancelled fusion'))
        return new Promise<Readonly<{ output: unknown; outputTokens: number }>>(
          () => undefined
        )
      })
    }

    await expect(
      planner(provider).plan({
        query,
        routeContext: context(),
        signal: controller.signal
      })
    ).rejects.toThrow('user cancelled fusion')
    expect(provider.invoke).toHaveBeenCalledTimes(1)
  })
})
