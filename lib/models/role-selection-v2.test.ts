import { describe, expect, it } from 'vitest'

import { registerModel } from './registry-v2'
import { selectVerifiedModelForRole } from './role-selection-v2'

const evaluatedAt = '2026-07-11T00:00:00.000Z'

function verifiedRouter(
  id: string,
  options: Parameters<typeof registerModel>[1] = {}
) {
  return registerModel(
    {
      providerId: 'openai',
      id,
      capabilities: ['structured_output', 'reasoning', 'json_mode']
    },
    {
      reliability: 'standard',
      maxContextTokens: 32_000,
      latencyClass: 'low',
      costClass: 'low',
      supportsCancellation: true,
      privacyClasses: ['public', 'private'],
      modelFamily: 'family-a',
      roleQualityScores: [
        {
          role: 'router',
          score: 0.9,
          fixtureVersion: 'router-fixtures-v1',
          evaluatedAt
        }
      ],
      ...options
    }
  )
}

describe('verified role model selection', () => {
  it('does not accept provider inference as the sole hard-capability evidence', () => {
    const inferredOnly = registerModel(
      { providerId: 'openai', id: 'inferred-only', capabilities: [] },
      {
        reliability: 'standard',
        maxContextTokens: 32_000,
        latencyClass: 'low',
        costClass: 'low',
        supportsCancellation: true,
        roleQualityScores: [
          {
            role: 'router',
            score: 0.95,
            fixtureVersion: 'router-fixtures-v1',
            evaluatedAt
          }
        ]
      }
    )

    const selection = selectVerifiedModelForRole([inferredOnly], 'router', {
      privacyClass: 'public',
      now: new Date(evaluatedAt)
    })

    expect(selection.selected).toBeNull()
    expect(selection.rejected[0]?.reasons).toContain(
      'missing_verified_hard_capability'
    )
    expect(selection.fallback).toEqual({
      kind: 'deterministic',
      id: 'deterministic_router_v1'
    })
  })

  it('gives explicit configured capabilities precedence over inference', () => {
    const configured = verifiedRouter('configured-router')
    const selection = selectVerifiedModelForRole([configured], 'router', {
      privacyClass: 'private',
      now: new Date(evaluatedAt)
    })

    expect(selection.selected?.model.modelId).toBe('configured-router')
    expect(selection.fallback).toBeNull()
  })

  it('rejects privacy, locality, availability, and quality incompatibilities', () => {
    const remotePublic = verifiedRouter('remote-public', {
      privacyClasses: ['public'],
      locality: 'remote'
    })
    const disabled = verifiedRouter('disabled', {
      availability: 'disabled'
    })
    const weak = verifiedRouter('weak', {
      roleQualityScores: [
        {
          role: 'router',
          score: 0.2,
          fixtureVersion: 'router-fixtures-v1',
          evaluatedAt
        }
      ]
    })

    const selection = selectVerifiedModelForRole(
      [remotePublic, disabled, weak],
      'router',
      {
        privacyClass: 'sensitive',
        requiredLocality: 'local',
        now: new Date(evaluatedAt)
      }
    )

    expect(selection.selected).toBeNull()
    expect(selection.rejected.flatMap(item => item.reasons)).toEqual(
      expect.arrayContaining([
        'privacy_incompatible',
        'locality_incompatible',
        'disabled',
        'quality_score_below_minimum'
      ])
    )
  })

  it('honors circuit cooldown without hiding permanent configuration errors', () => {
    const cooling = verifiedRouter('cooling', {
      circuitBreaker: {
        state: 'open',
        consecutiveTransientFailures: 3,
        cooldownUntil: '2026-07-11T01:00:00.000Z',
        permanentConfigurationError: false
      }
    })
    const misconfigured = verifiedRouter('misconfigured', {
      circuitBreaker: {
        state: 'closed',
        consecutiveTransientFailures: 0,
        cooldownUntil: null,
        permanentConfigurationError: true
      }
    })

    const selection = selectVerifiedModelForRole(
      [cooling, misconfigured],
      'router',
      {
        privacyClass: 'public',
        now: new Date(evaluatedAt)
      }
    )

    expect(selection.rejected[0]?.reasons).toContain('circuit_open')
    expect(selection.rejected[1]?.reasons).toContain(
      'permanent_configuration_error'
    )
  })

  it('uses deterministic ordering without mutating caller arrays', () => {
    const higherQuality = verifiedRouter('z-model', {
      roleQualityScores: [
        {
          role: 'router',
          score: 0.95,
          fixtureVersion: 'router-fixtures-v1',
          evaluatedAt
        }
      ]
    })
    const lowerQuality = verifiedRouter('a-model')
    const models = [lowerQuality, higherQuality]
    const originalOrder = models.map(model => model.modelId)

    const first = selectVerifiedModelForRole(models, 'router', {
      privacyClass: 'public',
      now: new Date(evaluatedAt)
    })
    const second = selectVerifiedModelForRole(models, 'router', {
      privacyClass: 'public',
      now: new Date(evaluatedAt)
    })

    expect(first.selected?.model.modelId).toBe('z-model')
    expect(second.selected?.model.modelId).toBe('z-model')
    expect(models.map(model => model.modelId)).toEqual(originalOrder)
  })

  it('prefers a different model family for Advisor when quality is equal', () => {
    const sameFamily = registerModel(
      {
        providerId: 'openai',
        id: 'same-family-advisor',
        capabilities: ['structured_output', 'reasoning', 'json_mode']
      },
      {
        reliability: 'strong',
        maxContextTokens: 128_000,
        latencyClass: 'high',
        costClass: 'high',
        supportsCancellation: true,
        privacyClasses: ['public'],
        modelFamily: 'composer-family',
        roleQualityScores: [
          {
            role: 'advisor',
            score: 0.9,
            fixtureVersion: 'advisor-fixtures-v1',
            evaluatedAt
          }
        ]
      }
    )
    const diverseFamily = registerModel(
      {
        providerId: 'anthropic',
        id: 'diverse-advisor',
        capabilities: ['structured_output', 'reasoning', 'json_mode']
      },
      {
        reliability: 'strong',
        maxContextTokens: 128_000,
        latencyClass: 'high',
        costClass: 'high',
        supportsCancellation: true,
        privacyClasses: ['public'],
        modelFamily: 'different-family',
        roleQualityScores: [
          {
            role: 'advisor',
            score: 0.9,
            fixtureVersion: 'advisor-fixtures-v1',
            evaluatedAt
          }
        ]
      }
    )

    const selection = selectVerifiedModelForRole(
      [sameFamily, diverseFamily],
      'advisor',
      {
        privacyClass: 'public',
        selectedFamiliesByRole: {
          answer_composer: 'composer-family'
        },
        now: new Date(evaluatedAt)
      }
    )

    expect(selection.selected?.model.modelId).toBe('diverse-advisor')
  })
})
