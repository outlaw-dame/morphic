import { describe, expect, it } from 'vitest'

import { buildDeterministicRouteFloor } from './router-admission'
import {
  buildRouteExecutionGuidance,
  createRouteExecutionContext,
  digestRoutePlan,
  InvalidRouteExecutionContextError
} from './execution-context'

describe('AI-I3C Router execution context', () => {
  it('accepts a canonical route only when its digest matches', () => {
    const routePlan = buildDeterministicRouteFloor({
      query: 'Who is the current CEO of OpenAI?'
    })
    const context = createRouteExecutionContext({
      routePlan,
      routeDigest: digestRoutePlan(routePlan)
    })

    expect(context.routePlan).toEqual(routePlan)
    expect(context.routeDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(Object.isFrozen(context)).toBe(true)
  })

  it('rejects a tampered route or digest', () => {
    const routePlan = buildDeterministicRouteFloor({
      query: 'Who is the current CEO of OpenAI?'
    })
    const routeDigest = digestRoutePlan(routePlan)

    expect(() =>
      createRouteExecutionContext({
        routePlan: { ...routePlan, maxToolCalls: routePlan.maxToolCalls + 1 },
        routeDigest
      })
    ).toThrow(InvalidRouteExecutionContextError)

    expect(() =>
      createRouteExecutionContext({
        routePlan,
        routeDigest: '0'.repeat(64)
      })
    ).toThrow(InvalidRouteExecutionContextError)
  })

  it('generates explicit non-waivable guidance from the canonical route', () => {
    const routePlan = buildDeterministicRouteFloor({
      query: 'Give current legal advice about an insurance settlement'
    })
    const context = createRouteExecutionContext({
      routePlan,
      routeDigest: digestRoutePlan(routePlan)
    })
    const guidance = buildRouteExecutionGuidance(context)

    expect(guidance).toContain('may not be weakened')
    expect(guidance).toContain('Freshness-sensitive claims')
    expect(guidance).toContain('Advisor review is required')
    expect(guidance).toContain('Citation verification is required')
    expect(guidance).toContain(context.routeDigest)
  })
})
