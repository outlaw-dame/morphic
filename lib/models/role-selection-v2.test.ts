import { describe, expect, it } from 'vitest'

import {
  getRoleSelectionRejectionReasons,
  type RoleModelCandidate,
  type RoleSelectionProfile,
  selectModelForRoleV2
} from './role-selection-v2'

const profile: RoleSelectionProfile = {
  role: 'advisor',
  hardCapabilities: ['structured_output'],
  preferredCapabilities: ['reasoning'],
  minimumReliability: 'standard',
  minimumContextTokens: 8_000,
  maximumLatencyMs: 5_000,
  maximumCostPerMillionTokensUsd: 20,
  allowedLocalities: ['remote'],
  minimumCapabilityProvenance: 'deployment_configured',
  minimumRoleQualityScore: 0.8,
  requiredToolPermissionClass: 'none',
  structuredOutputStrategy: 'native',
  fallbackModelIds: [],
  preferFamilyDiversityFrom: 'composer-family'
}

function candidate(
  overrides: Partial<RoleModelCandidate> = {}
): RoleModelCandidate {
  return {
    providerId: 'provider-a',
    modelId: 'model-a',
    family: 'advisor-family',
    availability: 'available',
    locality: 'remote',
    reliability: 'strong',
    maxContextTokens: 32_000,
    estimatedLatencyMs: 1_000,
    estimatedCostPerMillionTokensUsd: 5,
    capabilities: [
      {
        capability: 'structured_output',
        provenance: 'deployment_configured'
      },
      { capability: 'reasoning', provenance: 'model_card_declared' }
    ],
    roleQuality: [
      {
        role: 'advisor',
        score: 0.9,
        fixtureVersion: 'advisor-eval-v1',
        verifiedAt: '2026-07-11T00:00:00.000Z'
      }
    ],
    cooldownUntil: null,
    ...overrides
  }
}

describe('model role selection policy v2', () => {
  it('rejects inferred capability claims when stronger provenance is required', () => {
    const weak = candidate({
      capabilities: [
        { capability: 'structured_output', provenance: 'inferred' }
      ]
    })

    expect(getRoleSelectionRejectionReasons(weak, profile)).toContain(
      'capability_provenance_too_weak:structured_output'
    )
  })

  it('rejects unavailable, privacy-incompatible, low-quality, and cooling models', () => {
    expect(
      getRoleSelectionRejectionReasons(
        candidate({ availability: 'deprecated' }),
        profile
      )
    ).toContain('availability_deprecated')

    expect(
      getRoleSelectionRejectionReasons(candidate({ locality: 'local' }), profile)
    ).toContain('locality_not_allowed')

    expect(
      getRoleSelectionRejectionReasons(
        candidate({
          roleQuality: [
            {
              role: 'advisor',
              score: 0.2,
              fixtureVersion: 'advisor-eval-v1',
              verifiedAt: '2026-07-11T00:00:00.000Z'
            }
          ]
        }),
        profile
      )
    ).toContain('role_quality_below_minimum')

    expect(
      getRoleSelectionRejectionReasons(
        candidate({ cooldownUntil: '2026-07-12T00:00:00.000Z' }),
        profile,
        new Date('2026-07-11T00:00:00.000Z')
      )
    ).toContain('cooldown_active')
  })

  it('uses explicit fallback order before quality scoring', () => {
    const decision = selectModelForRoleV2(
      [
        candidate({ modelId: 'quality-winner', roleQuality: [{ role: 'advisor', score: 0.99, fixtureVersion: 'v1', verifiedAt: '2026-07-11T00:00:00.000Z' }] }),
        candidate({ modelId: 'configured-first', roleQuality: [{ role: 'advisor', score: 0.81, fixtureVersion: 'v1', verifiedAt: '2026-07-11T00:00:00.000Z' }] })
      ],
      { ...profile, fallbackModelIds: ['configured-first'] }
    )

    expect(decision.status).toBe('selected')
    if (decision.status === 'selected') {
      expect(decision.candidate.modelId).toBe('configured-first')
    }
  })

  it('prefers a different family when all hard requirements pass', () => {
    const decision = selectModelForRoleV2(
      [
        candidate({ modelId: 'same-family', family: 'composer-family' }),
        candidate({ modelId: 'diverse-family', family: 'advisor-family' })
      ],
      profile
    )

    expect(decision.status).toBe('selected')
    if (decision.status === 'selected') {
      expect(decision.candidate.modelId).toBe('diverse-family')
    }
  })

  it('is deterministic and does not mutate caller candidate arrays', () => {
    const candidates = [
      candidate({ providerId: 'provider-z', modelId: 'model-z' }),
      candidate({ providerId: 'provider-a', modelId: 'model-a' })
    ]
    const before = candidates.map(value => value.modelId)

    const first = selectModelForRoleV2(candidates, {
      ...profile,
      preferFamilyDiversityFrom: null
    })
    const second = selectModelForRoleV2([...candidates].reverse(), {
      ...profile,
      preferFamilyDiversityFrom: null
    })

    expect(candidates.map(value => value.modelId)).toEqual(before)
    expect(first.status).toBe('selected')
    expect(second.status).toBe('selected')
    if (first.status === 'selected' && second.status === 'selected') {
      expect(first.candidate.modelId).toBe('model-a')
      expect(second.candidate.modelId).toBe('model-a')
    }
  })

  it('returns an explicit deterministic fallback or no-model outcome', () => {
    const unavailable = candidate({ availability: 'disabled' })

    expect(
      selectModelForRoleV2([unavailable], profile, {
        deterministicFallbackAvailable: true
      }).status
    ).toBe('deterministic_fallback')

    expect(selectModelForRoleV2([unavailable], profile).status).toBe(
      'no_eligible_model'
    )
  })
})
