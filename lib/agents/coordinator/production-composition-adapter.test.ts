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
import type { SearchResultItem } from '@/lib/types'

import {
  type ComposerModelInput,
  createProductionCompositionAdapter
} from './production-composition-adapter'
import {
  type CoordinatorCompositionApproval,
  runGovernedResearchPipeline
} from './governed-pipeline'

const now = new Date('2026-07-11T12:00:00.000Z')

function context(query: string) {
  const routePlan = buildDeterministicRouteFloor({ query })
  return createRouteExecutionContext({
    routePlan,
    routeDigest: digestRoutePlan(routePlan)
  })
}

function scope() {
  return createTrustedRoleExecutionScope({
    ownerScopeId: 'owner_scope_00000001',
    executionId: 'execution_00000001',
    invocationId: 'invocation_0000001',
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    allowedPermissionClasses: ['none']
  })
}

function candidate() {
  return {
    providerId: 'provider-a',
    modelId: 'composer-model',
    family: 'composer-family',
    availability: 'available',
    locality: 'remote',
    reliability: 'strong',
    maxContextTokens: 64_000,
    estimatedLatencyMs: 100,
    estimatedCostPerMillionTokensUsd: 1,
    capabilities: [
      {
        capability: 'streaming',
        provenance: 'deployment_configured'
      },
      {
        capability: 'reasoning',
        provenance: 'model_card_declared'
      }
    ],
    roleQuality: [
      {
        role: 'answer_composer',
        score: 0.99,
        fixtureVersion: 'composer-fixture-v1',
        verifiedAt: new Date().toISOString()
      }
    ],
    cooldownUntil: null
  }
}

function result(url: string): SearchResultItem {
  return {
    title: 'Independent source',
    url,
    content: 'Plants convert light energy into chemical energy.',
    publishedAt: '2026-07-10T12:00:00.000Z'
  }
}

async function runWithProvider(
  provider: RoleProviderAdapter<ComposerModelInput>,
  signal?: AbortSignal
) {
  const query = 'Explain photosynthesis'
  return runGovernedResearchPipeline({
    query,
    routeContext: context(query),
    retrieval: {
      retrieve: async () => ({
        searchResults: [
          result('https://example.edu/report'),
          result('https://science.example.org/report')
        ],
        completedRoles: ['router', 'retriever'] as const,
        retrievedAt: now
      })
    },
    composition: createProductionCompositionAdapter({
      scope: scope(),
      candidates: [candidate()],
      provider
    }),
    signal,
    now
  })
}

describe('AI-I3G evidence-only production composition adapter', () => {
  it('receives only Coordinator-approved evidence with no tool permission', async () => {
    const provider: RoleProviderAdapter<ComposerModelInput> = {
      invoke: vi.fn(async invocation => {
        expect(invocation.role).toBe('answer_composer')
        expect(invocation.permissionClass).toBe('none')
        expect(invocation.input.query).toBe('Explain photosynthesis')
        expect(invocation.input.evidence).toHaveLength(2)
        expect(invocation.input).not.toHaveProperty('searchResults')
        expect(invocation.input).not.toHaveProperty('tools')
        expect(Object.isFrozen(invocation.input)).toBe(true)
        return {
          output: {
            draft: 'Photosynthesis converts light into chemical energy.',
            citedEvidenceIds: [invocation.input.evidence[0]!.id]
          },
          outputTokens: 12
        }
      })
    }

    const response = await runWithProvider(provider)

    expect(response.output.releaseStatus).toBe(
      'pending_advisor_and_citation_verifier'
    )
    expect(response.output.roleExecution.status).toBe('succeeded')
    expect(provider.invoke).toHaveBeenCalledTimes(1)
  })

  it('rejects a forged Coordinator approval before model invocation', async () => {
    const query = 'Explain photosynthesis'
    const routeContext = context(query)
    const provider: RoleProviderAdapter<ComposerModelInput> = {
      invoke: vi.fn()
    }
    const adapter = createProductionCompositionAdapter({
      scope: scope(),
      candidates: [candidate()],
      provider
    })
    const evidenceGraph = {
      items: [],
      duplicateGroups: [],
      claimClusters: [],
      conflicts: [],
      claimsByEvidenceId: {},
      warnings: []
    }

    await expect(
      adapter.compose({
        query,
        routeContext,
        evidenceGraph,
        completedRoles: ['router', 'retriever'],
        approval: {
          routeDigest: routeContext.routeDigest,
          evidenceGraph
        } as CoordinatorCompositionApproval
      })
    ).rejects.toThrow('Invalid Coordinator composition approval.')
    expect(provider.invoke).not.toHaveBeenCalled()
  })

  it('rejects citations outside the approved evidence graph', async () => {
    const provider: RoleProviderAdapter<ComposerModelInput> = {
      invoke: vi.fn(async () => ({
        output: {
          draft: 'Unsupported citation.',
          citedEvidenceIds: ['forged-evidence-id']
        },
        outputTokens: 5
      }))
    }

    await expect(runWithProvider(provider)).rejects.toThrow(
      'Composer cited evidence outside the approved graph.'
    )
  })

  it('propagates cancellation before Composer invocation', async () => {
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    const provider: RoleProviderAdapter<ComposerModelInput> = {
      invoke: vi.fn()
    }

    await expect(runWithProvider(provider, controller.signal)).rejects.toThrow(
      'cancelled'
    )
    expect(provider.invoke).not.toHaveBeenCalled()
  })

  it('rejects malformed model output through the hardened role runner', async () => {
    const provider: RoleProviderAdapter<ComposerModelInput> = {
      invoke: vi.fn(async () => ({
        output: { draft: '' },
        outputTokens: 1
      }))
    }

    await expect(runWithProvider(provider)).rejects.toThrow(
      'Composer execution failed: malformed_output.'
    )
  })
})
