import { describe, expect, it } from 'vitest'

import {
  createRouteExecutionContext,
  digestRoutePlan
} from '@/lib/ai/router/execution-context'
import { buildDeterministicRouteFloor } from '@/lib/ai/router/router-admission'

import { decideGovernedProductionRollout } from './governed-production-rollout'

function context(query: string) {
  const routePlan = buildDeterministicRouteFloor({ query })
  return createRouteExecutionContext({
    routePlan,
    routeDigest: digestRoutePlan(routePlan)
  })
}

describe('governed production rollout policy', () => {
  it('is disabled by default', () => {
    expect(
      decideGovernedProductionRollout({
        routeContext: context('Research current treatments for concussion')
      })
    ).toEqual({
      enabled: false,
      useGovernedChain: false,
      reason: 'disabled'
    })
  })

  it('enables only research routes from trusted server configuration', () => {
    expect(
      decideGovernedProductionRollout({
        routeContext: context('Research current treatments for concussion'),
        configuredValue: 'true'
      })
    ).toEqual({
      enabled: true,
      useGovernedChain: true,
      reason: 'governed_research_route'
    })

    expect(
      decideGovernedProductionRollout({
        routeContext: context('Hello'),
        configuredValue: 'true'
      })
    ).toEqual({
      enabled: true,
      useGovernedChain: false,
      reason: 'non_research_route'
    })
  })

  it('fails closed for malformed configuration', () => {
    expect(
      decideGovernedProductionRollout({
        routeContext: context('Research current treatments for concussion'),
        configuredValue: 'TRUE'
      })
    ).toEqual({
      enabled: false,
      useGovernedChain: false,
      reason: 'invalid_configuration'
    })
  })
})
