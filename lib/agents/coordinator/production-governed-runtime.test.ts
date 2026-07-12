import { describe, expect, it, vi } from 'vitest'

import {
  createRouteExecutionContext,
  digestRoutePlan
} from '@/lib/ai/router/execution-context'
import { buildDeterministicRouteFloor } from '@/lib/ai/router/router-admission'

import { createProductionGovernedRuntime } from './production-governed-runtime'

const query = 'Research the latest TypeScript release'

function routeContext() {
  const routePlan = buildDeterministicRouteFloor({ query })
  return createRouteExecutionContext({
    routePlan,
    routeDigest: digestRoutePlan(routePlan)
  })
}

function candidate(role: 'answer_composer' | 'citation_verifier') {
  return {
    providerId: 'provider-a',
    modelId: `${role}-model`,
    family: `${role}-family`,
    availability: 'available',
    locality: 'remote',
    reliability: 'strong',
    maxContextTokens: 64_000,
    estimatedLatencyMs: 100,
    estimatedCostPerMillionTokensUsd: 1,
    capabilities: [
      { capability: 'structured_output', provenance: 'deployment_configured' },
      { capability: 'reasoning', provenance: 'model_card_declared' },
      ...(role === 'answer_composer'
        ? [{ capability: 'streaming', provenance: 'deployment_configured' }]
        : [])
    ],
    roleQuality: [
      {
        role,
        score: 0.99,
        fixtureVersion: `${role}-fixture-v1`,
        verifiedAt: new Date().toISOString()
      }
    ],
    cooldownUntil: null
  }
}

function source(url: string) {
  return {
    title: 'Official TypeScript release source',
    url,
    content: 'The current TypeScript release is documented by the project.',
    publishedAt: new Date().toISOString()
  }
}

describe('AI-I3L production governed runtime factory', () => {
  it('constructs one execution-scoped governed chain with least privilege', async () => {
    const composerInvoke = vi.fn(async invocation => ({
      output: {
        draft: 'The current TypeScript release is documented by the project.',
        citedEvidenceIds: [invocation.input.evidence[0]!.id]
      },
      outputTokens: 12
    }))
    const citationInvoke = vi.fn(async invocation => ({
      output: {
        decision: 'verified',
        reasonCodes: ['citations_verified'],
        verifiedEvidenceIds: [...invocation.input.citedEvidenceIds],
        unsupportedEvidenceIds: [],
        missingCitationClaimIds: [],
        confidence: 0.99
      },
      outputTokens: 8
    }))

    const runtime = createProductionGovernedRuntime({
      ownerScopeId: 'owner_scope_00000001',
      executionId: 'execution_00000001',
      retrievalExecutor: {
        execute: async () => ({
          searchResults: [
            source('https://www.typescriptlang.org/docs/'),
            source('https://github.com/microsoft/TypeScript/releases')
          ],
          completedRoles: [
            'router',
            'retriever',
            'fusion_planner',
            'source_quality'
          ],
          retrievedAt: new Date()
        })
      },
      composer: {
        candidates: [candidate('answer_composer')],
        provider: { invoke: composerInvoke }
      },
      citationVerifier: {
        candidates: [candidate('citation_verifier')],
        provider: { invoke: citationInvoke }
      }
    })

    const released = await runtime.run({
      query,
      routeContext: routeContext()
    })

    expect(released.status).toBe('released')
    expect(runtime.executionId).toBe('execution_00000001')
    expect(composerInvoke).toHaveBeenCalledTimes(1)
    expect(citationInvoke).toHaveBeenCalledTimes(1)
    expect(composerInvoke.mock.calls[0]![0]).toMatchObject({
      executionId: 'execution_00000001',
      role: 'answer_composer',
      permissionClass: 'none'
    })
    expect(citationInvoke.mock.calls[0]![0]).toMatchObject({
      executionId: 'execution_00000001',
      role: 'citation_verifier',
      permissionClass: 'evidence_read_only'
    })
  })

  it('rejects inherited provider methods before constructing the runtime', () => {
    const inherited = Object.create({ invoke: vi.fn() })
    expect(() =>
      createProductionGovernedRuntime({
        ownerScopeId: 'owner_scope_00000001',
        retrievalExecutor: { execute: vi.fn() },
        composer: {
          candidates: [candidate('answer_composer')],
          provider: inherited
        },
        citationVerifier: {
          candidates: [candidate('citation_verifier')],
          provider: { invoke: vi.fn() }
        }
      })
    ).toThrow('Invalid governed Composer provider.')
  })

  it('rejects invalid deadlines and empty candidate sets fail closed', () => {
    const base = {
      ownerScopeId: 'owner_scope_00000001',
      retrievalExecutor: { execute: vi.fn() },
      composer: {
        candidates: [candidate('answer_composer')],
        provider: { invoke: vi.fn() }
      },
      citationVerifier: {
        candidates: [candidate('citation_verifier')],
        provider: { invoke: vi.fn() }
      }
    }

    expect(() =>
      createProductionGovernedRuntime({ ...base, deadlineMs: 999 })
    ).toThrow('Invalid governed runtime deadline.')
    expect(() =>
      createProductionGovernedRuntime({
        ...base,
        composer: { ...base.composer, candidates: [] }
      })
    ).toThrow('Invalid governed Composer candidates.')
  })
})
