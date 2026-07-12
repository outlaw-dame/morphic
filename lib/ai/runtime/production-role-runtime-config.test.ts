import { describe, expect, it } from 'vitest'

import { resolveProductionRoleRuntimeConfig } from './production-role-runtime-config'

const now = new Date('2026-07-12T12:00:00.000Z')

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    providerId: 'openai',
    modelId: 'governed-model',
    family: 'governed-family',
    availability: 'available',
    locality: 'remote',
    reliability: 'strong',
    maxContextTokens: 64_000,
    estimatedLatencyMs: 500,
    estimatedCostPerMillionTokensUsd: 5,
    capabilities: [
      { capability: 'streaming', provenance: 'deployment_configured' },
      { capability: 'structured_output', provenance: 'deployment_configured' },
      { capability: 'reasoning', provenance: 'model_card_declared' }
    ],
    roleQuality: [
      {
        role: 'answer_composer',
        score: 0.95,
        fixtureVersion: 'composer-v1',
        verifiedAt: now.toISOString()
      },
      {
        role: 'advisor',
        score: 0.95,
        fixtureVersion: 'advisor-v1',
        verifiedAt: now.toISOString()
      },
      {
        role: 'citation_verifier',
        score: 0.97,
        fixtureVersion: 'citation-v1',
        verifiedAt: now.toISOString()
      }
    ],
    cooldownUntil: null,
    ...overrides
  }
}

function raw(candidates: unknown[]) {
  return JSON.stringify({ version: 1, candidates })
}

describe('production role runtime configuration', () => {
  it('returns one immutable eligible plan for every production model role', () => {
    const result = resolveProductionRoleRuntimeConfig({
      rawConfig: raw([candidate()]),
      now
    })

    expect(result.status).toBe('ready')
    if (result.status !== 'ready')
      throw new Error('Expected ready runtime plan.')
    expect(Object.keys(result.selectedByRole).sort()).toEqual([
      'advisor',
      'answer_composer',
      'citation_verifier'
    ])
    expect(result.selectedByRole.answer_composer.modelId).toBe('governed-model')
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.selectedByRole)).toBe(true)
  })

  it('fails closed when configuration is missing, malformed, or oversized', () => {
    expect(
      resolveProductionRoleRuntimeConfig({ rawConfig: undefined, now })
    ).toEqual({
      status: 'unavailable',
      reasonCodes: ['runtime_config_missing']
    })
    expect(resolveProductionRoleRuntimeConfig({ rawConfig: '{', now })).toEqual(
      {
        status: 'unavailable',
        reasonCodes: ['runtime_config_invalid_json']
      }
    )
    expect(
      resolveProductionRoleRuntimeConfig({
        rawConfig: 'x'.repeat(256_001),
        now
      })
    ).toEqual({
      status: 'unavailable',
      reasonCodes: ['runtime_config_too_large']
    })
  })

  it('rejects unknown fields, duplicate identities, and unsupported providers', () => {
    expect(
      resolveProductionRoleRuntimeConfig({
        rawConfig: JSON.stringify({
          version: 1,
          candidates: [candidate()],
          clientOverride: true
        }),
        now
      })
    ).toEqual({
      status: 'unavailable',
      reasonCodes: ['runtime_config_schema_invalid']
    })

    expect(
      resolveProductionRoleRuntimeConfig({
        rawConfig: raw([candidate(), candidate()]),
        now
      })
    ).toEqual({
      status: 'unavailable',
      reasonCodes: ['runtime_config_duplicate_candidate']
    })

    expect(
      resolveProductionRoleRuntimeConfig({
        rawConfig: raw([candidate({ providerId: 'hostile-provider' })]),
        now
      })
    ).toEqual({
      status: 'unavailable',
      reasonCodes: ['runtime_config_unsupported_provider']
    })
  })

  it('does not infer eligibility from weak capability provenance', () => {
    const weakCapabilities = [
      { capability: 'streaming', provenance: 'inferred' },
      { capability: 'structured_output', provenance: 'provider_declared' }
    ]
    const result = resolveProductionRoleRuntimeConfig({
      rawConfig: raw([candidate({ capabilities: weakCapabilities })]),
      now
    })

    expect(result).toEqual({
      status: 'unavailable',
      reasonCodes: [
        'no_eligible_model:answer_composer',
        'no_eligible_model:advisor',
        'no_eligible_model:citation_verifier'
      ]
    })
  })

  it('rejects stale or incomplete role evaluations', () => {
    const stale = new Date(
      now.getTime() - 91 * 24 * 60 * 60 * 1000
    ).toISOString()
    const staleQuality = candidate().roleQuality.map(item => ({
      ...item,
      verifiedAt: stale
    }))
    expect(
      resolveProductionRoleRuntimeConfig({
        rawConfig: raw([candidate({ roleQuality: staleQuality })]),
        now
      })
    ).toEqual({
      status: 'unavailable',
      reasonCodes: [
        'no_eligible_model:answer_composer',
        'no_eligible_model:advisor',
        'no_eligible_model:citation_verifier'
      ]
    })

    const composerOnly = candidate().roleQuality.filter(
      item => item.role === 'answer_composer'
    )
    expect(
      resolveProductionRoleRuntimeConfig({
        rawConfig: raw([candidate({ roleQuality: composerOnly })]),
        now
      })
    ).toEqual({
      status: 'unavailable',
      reasonCodes: [
        'no_eligible_model:advisor',
        'no_eligible_model:citation_verifier'
      ]
    })
  })

  it('rejects invalid deterministic time without throwing', () => {
    expect(
      resolveProductionRoleRuntimeConfig({
        rawConfig: raw([candidate()]),
        now: new Date(Number.NaN)
      })
    ).toEqual({
      status: 'unavailable',
      reasonCodes: ['runtime_config_invalid_time']
    })
  })
})
