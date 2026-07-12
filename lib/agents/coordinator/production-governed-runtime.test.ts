import { describe, expect, it, vi } from 'vitest'

import { createProductionGovernedRuntime } from './production-governed-runtime'

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

function baseConfiguration() {
  return {
    ownerScopeId: 'owner_scope_00000001',
    executionId: 'execution_00000001',
    deadlineMs: 60_000,
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
}

describe('production governed runtime factory', () => {
  it('constructs one bounded execution-scoped runtime', () => {
    const runtime = createProductionGovernedRuntime(baseConfiguration())

    expect(runtime.executionId).toBe('execution_00000001')
    expect(Number.isFinite(Date.parse(runtime.deadlineAt))).toBe(true)
    expect(typeof runtime.run).toBe('function')
  })

  it('rejects null, inherited, and malformed provider methods cleanly', () => {
    const inherited = Object.create({ invoke: vi.fn() })
    const base = baseConfiguration()

    expect(() =>
      createProductionGovernedRuntime({
        ...base,
        composer: { ...base.composer, provider: null as never }
      })
    ).toThrow('Invalid governed Composer provider.')

    expect(() =>
      createProductionGovernedRuntime({
        ...base,
        composer: { ...base.composer, provider: inherited }
      })
    ).toThrow('Invalid governed Composer provider.')

    expect(() =>
      createProductionGovernedRuntime({
        ...base,
        composer: { ...base.composer, provider: { invoke: 'bad' } as never }
      })
    ).toThrow('Invalid governed Composer provider.')
  })

  it('rejects invalid deadlines and empty candidate sets fail closed', () => {
    const base = baseConfiguration()

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
