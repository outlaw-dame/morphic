import { describe, expect, it, vi } from 'vitest'

import {
  createRouteExecutionContext,
  digestRoutePlan
} from '@/lib/ai/router/execution-context'
import { buildDeterministicRouteFloor } from '@/lib/ai/router/router-admission'

import { executeGovernedStream } from './governed-stream-executor'

function context(query: string) {
  const routePlan = buildDeterministicRouteFloor({ query })
  return createRouteExecutionContext({
    routePlan,
    routeDigest: digestRoutePlan(routePlan)
  })
}

function decision(mode: 'off' | 'shadow' | 'enforce', selected: boolean) {
  return Object.freeze({
    mode,
    selected,
    percentage: selected ? 100 : 0,
    bucket: selected ? 1 : 9999,
    cohortId: selected ? 'a'.repeat(16) : 'disabled'
  })
}

describe('governed stream executor', () => {
  it('keeps explicit non-research chat on the quick legacy path', async () => {
    const legacy = vi.fn(async () => 'quick-response')
    const governed = vi.fn(async () => 'governed-response')

    const result = await executeGovernedStream({
      routeContext: context('Hello, how are you?'),
      rolloutDecision: decision('enforce', true),
      executeLegacy: legacy,
      executeGoverned: governed
    })

    expect(result).toEqual({ path: 'quick', value: 'quick-response' })
    expect(governed).not.toHaveBeenCalled()
  })

  it('never falls back to legacy when enforced governed execution fails', async () => {
    const legacy = vi.fn(async () => 'legacy-response')

    await expect(
      executeGovernedStream({
        routeContext: context('Research the current CEO of Apple'),
        rolloutDecision: decision('enforce', true),
        executeLegacy: legacy,
        executeGoverned: async () => {
          throw new Error('governed chain failed')
        }
      })
    ).rejects.toThrow('governed chain failed')

    expect(legacy).not.toHaveBeenCalled()
  })

  it('never exposes shadow output and isolates observer failure', async () => {
    const order: string[] = []
    const result = await executeGovernedStream({
      routeContext: context('Research the current CEO of Apple'),
      rolloutDecision: decision('shadow', true),
      executeGoverned: async () => {
        order.push('governed')
        return 'secret-governed-draft'
      },
      executeLegacy: async () => {
        order.push('legacy')
        return 'legacy-response'
      },
      onShadowOutcome: async () => {
        throw new Error('telemetry unavailable')
      }
    })

    expect(order).toEqual(['governed', 'legacy'])
    expect(result).toEqual({ path: 'shadow', value: 'legacy-response' })
    expect(JSON.stringify(result)).not.toContain('secret-governed-draft')
  })

  it('propagates cancellation and prevents legacy fallback', async () => {
    const controller = new AbortController()
    const legacy = vi.fn(async () => 'legacy-response')

    await expect(
      executeGovernedStream({
        routeContext: context('Research the current CEO of Apple'),
        rolloutDecision: decision('shadow', true),
        signal: controller.signal,
        executeGoverned: async () => {
          controller.abort(new Error('request cancelled'))
          throw new Error('provider cancelled')
        },
        executeLegacy: legacy
      })
    ).rejects.toThrow('request cancelled')

    expect(legacy).not.toHaveBeenCalled()
  })
})
