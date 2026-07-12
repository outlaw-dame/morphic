import { describe, expect, it, vi } from 'vitest'

import {
  createRouteExecutionContext,
  digestRoutePlan
} from '@/lib/ai/router/execution-context'
import { buildDeterministicRouteFloor } from '@/lib/ai/router/router-admission'
import {
  createTrustedRoleExecutionScope,
  type RoleProviderAdapter
} from '@/lib/ai/role-runner'

import {
  createProductionFusionPlanner,
  type FusionPlannerModelInput
} from './production-fusion-planner-adapter'

const query = 'Who founded Example Corp and what changed recently?'

function context(value: string = query) {
  const routePlan = buildDeterministicRouteFloor({ query: value })
  return createRouteExecutionContext({
    routePlan,
    routeDigest: digestRoutePlan(routePlan)
  })
}

function scope() {
  return createTrustedRoleExecutionScope({
    ownerScopeId: 'owner_scope_00000001',
    executionId: 'execution_00000001',
    invocationId: 'fusion_invocation_0001',
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    allowedPermissionClasses: ['retrieval_plan_only']
  })
}

function candidate() {
  return {
    providerId: 'provider-a',
    modelId: 'fusion-model',
    family: 'fusion-family',
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

function validOutput(input: FusionPlannerModelInput) {
  const requiredSource = input.requiredSourceClasses[0] ?? 'official_source'
  return {
    paths: [
      {
        id: 'entity_path',
        query: 'Example Corp founder stable identifier official sources',
        sourceClass: requiredSource,
        evidenceRole: 'entity_disambiguation',
        maxResults: 10,
        requiresFreshness: false
      },
      {
        id: 'freshness_path',
        query: 'Example Corp recent changes current official sources',
        sourceClass: requiredSource,
        evidenceRole: 'freshness_check',
        maxResults: 10,
        requiresFreshness: true
      }
    ],
    reasonCodes: ['independent_paths_required']
  }
}

function planner(provider: RoleProviderAdapter<FusionPlannerModelInput>) {
  return createProductionFusionPlanner({
    scope: scope(),
    candidates: [candidate()],
    provider
  })
}

describe('AI-I5A production Fusion Planner adapter', () => {
  it('runs through retrieval_plan_only and returns bounded immutable paths', async () => {
    const provider: RoleProviderAdapter<FusionPlannerModelInput> = {
      invoke: vi.fn(async invocation => {
        expect(invocation.role).toBe('fusion_planner')
        expect(invocation.permissionClass).toBe('retrieval_plan_only')
        expect(invocation.input).not.toHaveProperty('tools')
        expect(invocation.input).not.toHaveProperty('searchResults')
        expect(Object.isFrozen(invocation.input)).toBe(true)
        return {
          output: validOutput(invocation.input),
          outputTokens: 100
        }
      })
    }

    const result = await planner(provider).plan({
      query,
      routeContext: context()
    })

    expect(result.paths).toHaveLength(2)
    expect(Object.isFrozen(result.paths)).toBe(true)
    expect(result.roleExecution.role).toBe('fusion_planner')
    expect(provider.invoke).toHaveBeenCalledTimes(1)
  })

  it('rejects routes that do not authorize Fusion before provider invocation', async () => {
    const provider = { invoke: vi.fn() }
    await expect(
      planner(provider).plan({
        query: 'Hello',
        routeContext: context('Hello')
      })
    ).rejects.toThrow('Router did not authorize Fusion Planner execution.')
    expect(provider.invoke).not.toHaveBeenCalled()
  })

  it('rejects duplicate path identifiers', async () => {
    await expect(
      planner({
        invoke: async invocation => {
          const output = validOutput(invocation.input)
          return {
            output: {
              ...output,
              paths: output.paths.map(path => ({ ...path, id: 'duplicate' }))
            },
            outputTokens: 100
          }
        }
      }).plan({ query, routeContext: context() })
    ).rejects.toThrow('Fusion Planner execution failed: malformed_output.')
  })

  it('rejects a disallowed source class with bounded diagnostics', async () => {
    await expect(
      planner({
        invoke: async invocation => ({
          output: {
            ...validOutput(invocation.input),
            paths: [
              {
                id: 'blocked_path',
                query: 'blocked source search',
                sourceClass: 'content_farm',
                evidenceRole: 'entity_disambiguation',
                maxResults: 10,
                requiresFreshness: true
              }
            ]
          },
          outputTokens: 100
        })
      }).plan({ query, routeContext: context() })
    ).rejects.toThrow(
      'Fusion Planner selected disallowed source class "content_farm" in path "blocked_path".'
    )
  })

  it('rejects omission of required entity and freshness lanes', async () => {
    await expect(
      planner({
        invoke: async invocation => ({
          output: {
            paths: [
              {
                id: 'background_only',
                query: 'Example Corp background',
                sourceClass:
                  invocation.input.requiredSourceClasses[0] ?? 'official_source',
                evidenceRole: 'background_context',
                maxResults: 10,
                requiresFreshness: false
              }
            ],
            reasonCodes: ['background_only']
          },
          outputTokens: 100
        })
      }).plan({ query, routeContext: context() })
    ).rejects.toThrow('Fusion Planner omitted the required freshness path.')
  })

  it('preserves cancellation during provider invocation', async () => {
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
  })
})
