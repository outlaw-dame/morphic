import { describe, expect, it, vi } from 'vitest'

import {
  createRouteExecutionContext,
  digestRoutePlan
} from '@/lib/ai/router/execution-context'
import { buildDeterministicRouteFloor } from '@/lib/ai/router/router-admission'

import { runProductionGovernedChain } from './production-governed-chain'

function context(query: string) {
  const routePlan = buildDeterministicRouteFloor({ query })
  return createRouteExecutionContext({
    routePlan,
    routeDigest: digestRoutePlan(routePlan)
  })
}

const invalidPorts = {
  retrieval: { retrieve: vi.fn() },
  composition: { compose: vi.fn() },
  citationVerifier: { verify: vi.fn() }
}

describe('production governed-chain facade', () => {
  it('rejects non-research routes before invoking any adapter', async () => {
    await expect(
      runProductionGovernedChain({
        query: 'Hello there',
        routeContext: context('Hello there'),
        ...invalidPorts
      })
    ).rejects.toThrow('Governed production chain requires a research route.')

    expect(invalidPorts.retrieval.retrieve).not.toHaveBeenCalled()
    expect(invalidPorts.composition.compose).not.toHaveBeenCalled()
    expect(invalidPorts.citationVerifier.verify).not.toHaveBeenCalled()
  })

  it('requires Advisor capability before retrieval for Advisor-mandated routes', async () => {
    const retrieval = { retrieve: vi.fn() }
    await expect(
      runProductionGovernedChain({
        query: 'Provide current medical guidance for concussion treatment',
        routeContext: context(
          'Provide current medical guidance for concussion treatment'
        ),
        retrieval,
        composition: { compose: vi.fn() },
        citationVerifier: { verify: vi.fn() }
      })
    ).rejects.toThrow('Governed production chain is missing the required Advisor port.')

    expect(retrieval.retrieve).not.toHaveBeenCalled()
  })

  it('preserves caller cancellation before retrieval starts', async () => {
    const controller = new AbortController()
    controller.abort(new Error('user cancelled governed request'))
    const retrieval = { retrieve: vi.fn() }

    await expect(
      runProductionGovernedChain({
        query: 'Research the latest TypeScript release',
        routeContext: context('Research the latest TypeScript release'),
        retrieval,
        composition: { compose: vi.fn() },
        citationVerifier: { verify: vi.fn() },
        signal: controller.signal
      })
    ).rejects.toThrow('user cancelled governed request')

    expect(retrieval.retrieve).not.toHaveBeenCalled()
  })
})
