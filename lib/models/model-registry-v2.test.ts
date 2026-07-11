import { describe, expect, it } from 'vitest'

import { InvalidArchitectureContractError } from '@/lib/ai/architecture'

import {
  normalizeConfiguredModelRecord,
  normalizeConfiguredModelRegistry
} from './model-registry-v2'

function configuredModel(overrides: Record<string, unknown> = {}) {
  return {
    providerId: 'provider-a',
    modelId: 'model-a',
    family: 'family-a',
    availability: 'available',
    locality: 'remote',
    reliability: 'strong',
    maxContextTokens: 32_000,
    estimatedLatencyMs: 1_000,
    estimatedCostPerMillionTokensUsd: 5,
    capabilityAssertions: [
      {
        capability: 'structured_output',
        provenance: 'deployment_configured'
      }
    ],
    legacyCapabilities: ['tools', 'structured_output', 'unsupported'],
    roleQuality: [
      {
        role: 'router',
        score: 0.95,
        fixtureVersion: 'router-v1',
        verifiedAt: '2026-07-11T00:00:00.000Z'
      }
    ],
    cooldownUntil: null,
    ...overrides
  }
}

describe('model registry v2 normalization', () => {
  it('retains strongest provenance and keeps legacy claims inferred', () => {
    const candidate = normalizeConfiguredModelRecord(configuredModel())

    expect(candidate.capabilities).toEqual([
      { capability: 'structured_output', provenance: 'deployment_configured' },
      { capability: 'tool_calling', provenance: 'inferred' }
    ])
  })

  it('rejects unknown fields and accessors without invoking them', () => {
    expect(() =>
      normalizeConfiguredModelRecord(
        configuredModel({ authenticatedScope: 'attacker-controlled' })
      )
    ).toThrow(InvalidArchitectureContractError)

    let invoked = false
    const value = configuredModel()
    Object.defineProperty(value, 'providerId', {
      enumerable: true,
      get() {
        invoked = true
        return 'provider-a'
      }
    })

    expect(() => normalizeConfiguredModelRecord(value)).toThrow(
      InvalidArchitectureContractError
    )
    expect(invoked).toBe(false)
  })

  it('rejects duplicate provider-qualified identities', () => {
    expect(() =>
      normalizeConfiguredModelRegistry([
        configuredModel(),
        configuredModel({ family: 'different-family' })
      ])
    ).toThrow('Duplicate configured model identity')
  })

  it('sorts registry entries deterministically without mutating input', () => {
    const inputs = [
      configuredModel({ providerId: 'provider-z', modelId: 'model-z' }),
      configuredModel({ providerId: 'provider-a', modelId: 'model-a' })
    ]
    const before = inputs.map(value => `${value.providerId}/${value.modelId}`)

    const registry = normalizeConfiguredModelRegistry(inputs)

    expect(inputs.map(value => `${value.providerId}/${value.modelId}`)).toEqual(
      before
    )
    expect(registry.map(value => `${value.providerId}/${value.modelId}`)).toEqual([
      'provider-a/model-a',
      'provider-z/model-z'
    ])
  })
})
