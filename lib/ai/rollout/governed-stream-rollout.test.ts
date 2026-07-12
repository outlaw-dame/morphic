import { describe, expect, it } from 'vitest'

import {
  assertLegacyResearchStreamAllowed,
  decideGovernedStreamRollout
} from './governed-stream-rollout'

const routeDigest = 'a'.repeat(64)
const salt = 'server-controlled-rollout-salt-0000000001'

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    AI_GOVERNED_STREAM_MODE: 'shadow',
    AI_GOVERNED_STREAM_PERCENT: '50',
    AI_GOVERNED_STREAM_SALT: salt,
    ...overrides
  }
}

describe('AI-I3K governed stream rollout authority', () => {
  it('defaults to an off, non-selected decision', () => {
    expect(
      decideGovernedStreamRollout({
        cohortKey: 'owner_scope_1',
        routeDigest,
        environment: {}
      })
    ).toEqual({
      mode: 'off',
      selected: false,
      percentage: 0,
      bucket: 0,
      cohortId: 'disabled'
    })
  })

  it('selects the same cohort deterministically', () => {
    const first = decideGovernedStreamRollout({
      cohortKey: 'owner_scope_1',
      routeDigest,
      environment: environment()
    })
    const second = decideGovernedStreamRollout({
      cohortKey: 'owner_scope_1',
      routeDigest,
      environment: environment()
    })

    expect(second).toEqual(first)
    expect(first.bucket).toBeGreaterThanOrEqual(0)
    expect(first.bucket).toBeLessThan(10_000)
    expect(first.cohortId).toMatch(/^[a-f0-9]{16}$/)
    expect(Object.isFrozen(first)).toBe(true)
  })

  it('selects every cohort at one hundred percent', () => {
    const decision = decideGovernedStreamRollout({
      cohortKey: 'owner_scope_2',
      routeDigest,
      environment: environment({ AI_GOVERNED_STREAM_PERCENT: '100' })
    })

    expect(decision.selected).toBe(true)
    expect(decision.mode).toBe('shadow')
  })

  it('rejects malformed configuration and weak salts', () => {
    expect(() =>
      decideGovernedStreamRollout({
        cohortKey: 'owner_scope_1',
        routeDigest,
        environment: environment({ AI_GOVERNED_STREAM_MODE: 'maybe' })
      })
    ).toThrow('Invalid governed stream rollout mode.')

    expect(() =>
      decideGovernedStreamRollout({
        cohortKey: 'owner_scope_1',
        routeDigest,
        environment: environment({ AI_GOVERNED_STREAM_PERCENT: '101' })
      })
    ).toThrow('Invalid governed stream rollout percentage.')

    expect(() =>
      decideGovernedStreamRollout({
        cohortKey: 'owner_scope_1',
        routeDigest,
        environment: environment({ AI_GOVERNED_STREAM_SALT: 'too-short' })
      })
    ).toThrow('Invalid governed stream rollout salt.')
  })

  it('rejects malformed cohort keys and route digests', () => {
    expect(() =>
      decideGovernedStreamRollout({
        cohortKey: '',
        routeDigest,
        environment: environment()
      })
    ).toThrow('Invalid governed stream cohort key.')

    expect(() =>
      decideGovernedStreamRollout({
        cohortKey: 'owner_scope_1',
        routeDigest: 'not-a-digest',
        environment: environment()
      })
    ).toThrow('Invalid governed stream route digest.')
  })

  it('allows legacy execution for off, shadow, and non-selected enforce cohorts', () => {
    expect(() =>
      assertLegacyResearchStreamAllowed({
        mode: 'off',
        selected: false,
        percentage: 0,
        bucket: 0,
        cohortId: 'disabled'
      })
    ).not.toThrow()

    expect(() =>
      assertLegacyResearchStreamAllowed({
        mode: 'shadow',
        selected: true,
        percentage: 100,
        bucket: 1,
        cohortId: 'a'.repeat(16)
      })
    ).not.toThrow()

    expect(() =>
      assertLegacyResearchStreamAllowed({
        mode: 'enforce',
        selected: false,
        percentage: 50,
        bucket: 9000,
        cohortId: 'b'.repeat(16)
      })
    ).not.toThrow()
  })

  it('fails closed instead of falling back when enforce selects a request', () => {
    expect(() =>
      assertLegacyResearchStreamAllowed({
        mode: 'enforce',
        selected: true,
        percentage: 100,
        bucket: 1,
        cohortId: 'c'.repeat(16)
      })
    ).toThrow('Governed stream enforcement selected without an approved release.')
  })
})
