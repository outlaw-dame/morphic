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

function createMockPorts() {
  return {
    retrieval: { retrieve: vi.fn() },
    composition: { compose: vi.fn() },
    citationVerifier: { verify: vi.fn() }
  }
}

describe('production governed-chain facade', () => {
  it('rejects non-research routes before invoking any adapter', async () => {
    const ports = createMockPorts()
    await expect(
      runProductionGovernedChain({
        query: 'Hello',
        routeContext: context('Hello'),
        ...ports
      })
    ).rejects.toThrow('Governed production chain requires a research route.')

    expect(ports.retrieval.retrieve).not.toHaveBeenCalled()
    expect(ports.composition.compose).not.toHaveBeenCalled()
    expect(ports.citationVerifier.verify).not.toHaveBeenCalled()
  })

  it('requires Advisor capability before retrieval for Advisor-mandated routes', async () => {
    const query = 'Provide medical treatment guidance for a concussion'
    const retrieval = { retrieve: vi.fn() }
    await expect(
      runProductionGovernedChain({
        query,
        routeContext: context(query),
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
