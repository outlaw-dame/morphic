import { describe, expect, it } from 'vitest'

import type { ReleasedProductionResponse } from '@/lib/agents/coordinator/production-release-gate'
import type { GovernedStreamRolloutDecision } from '@/lib/ai/rollout/governed-stream-rollout'
import {
  createRouteExecutionContext,
  digestRoutePlan
} from '@/lib/ai/router/execution-context'
import { buildDeterministicRouteFloor } from '@/lib/ai/router/router-admission'

import { createGovernedReleaseStreamResponse } from './create-governed-release-stream-response'

const query = 'Research current concussion treatment guidance'
const routePlan = buildDeterministicRouteFloor({ query })
const routeContext = createRouteExecutionContext({
  routePlan,
  routeDigest: digestRoutePlan(routePlan)
})

const digest = 'a'.repeat(64)

function release(
  overrides: Partial<ReleasedProductionResponse> = {}
): ReleasedProductionResponse {
  return {
    status: 'released',
    routeDigest: routeContext.routeDigest,
    executionId: 'execution_0000000000001',
    draft: 'Use evidence-based concussion guidance.',
    citedEvidenceIds: ['evidence-1'],
    composerOutputDigest: digest,
    advisorOutputDigest: digest,
    citationVerifierOutputDigest: digest,
    releasedAt: new Date().toISOString(),
    ...overrides
  }
}

const enforcedDecision: GovernedStreamRolloutDecision = Object.freeze({
  mode: 'enforce',
  selected: true,
  percentage: 100,
  bucket: 1,
  cohortId: 'cohort-00000001'
})

describe('governed release UI stream response', () => {
  it('emits only a validated released draft with no-store headers', async () => {
    const response = createGovernedReleaseStreamResponse({
      release: release(),
      routeContext,
      rolloutDecision: enforcedDecision,
      traceId: 'trace-000000000001'
    })

    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-governed-route-digest')).toBe(
      routeContext.routeDigest
    )
    expect(response.headers.get('x-governed-execution-id')).toBe(
      'execution_0000000000001'
    )
    expect(response.headers.get('x-trace-id')).toBe('trace-000000000001')

    const body = await response.text()
    expect(body).toContain('Use evidence-based concussion guidance.')
    expect(body).not.toContain('evidence-1')
  })

  it('rejects a release from another route', () => {
    expect(() =>
      createGovernedReleaseStreamResponse({
        release: release({ routeDigest: 'b'.repeat(64) }),
        routeContext,
        rolloutDecision: enforcedDecision
      })
    ).toThrow('Invalid governed production release.')
  })

  it('rejects non-enforced rollout decisions', () => {
    expect(() =>
      createGovernedReleaseStreamResponse({
        release: release(),
        routeContext,
        rolloutDecision: Object.freeze({
          ...enforcedDecision,
          mode: 'shadow',
          selected: true
        })
      })
    ).toThrow(
      'Governed release stream requires enforced rollout selection.'
    )
  })

  it('rejects uncited and malformed released payloads', () => {
    expect(() =>
      createGovernedReleaseStreamResponse({
        release: release({ citedEvidenceIds: [] }),
        routeContext,
        rolloutDecision: enforcedDecision
      })
    ).toThrow('Invalid governed production release.')

    expect(() =>
      createGovernedReleaseStreamResponse({
        release: release({ draft: '' }),
        routeContext,
        rolloutDecision: enforcedDecision
      })
    ).toThrow('Invalid governed production release.')
  })
})
