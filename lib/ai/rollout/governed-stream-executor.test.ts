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

function decision(
  mode: 'off' | 'shadow' | 'enforce',
  selected: boolean
) {
  return Object.freeze({
    mode,
    selected,
    percentage: selected ? 100 : 0,
    bucket: selected ? 1 : 9999,
    cohortId: selected ? 'a'.repeat(16) : 'disabled'
  })
}

describe('AI-I3K controlled governed stream executor', () => {
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
    expect(legacy).toHaveBeenCalledTimes(1)
    expect(governed).not.toHaveBeenCalled()
  })

  it('uses legacy execution for disabled and non-selected requests', async () => {
    const legacy = vi.fn(async () => 'legacy-response')
    const governed = vi.fn(async () => 'governed-response')

    const result = await executeGovernedStream({
      routeContext: context('Research the current CEO of Apple'),
      rolloutDecision: decision('enforce', false),
      executeLegacy: legacy,
      executeGoverned: governed
    })

    expect(result.path).toBe('legacy')
    expect(legacy).toHaveBeenCalledTimes(1)
    expect(governed).not.toHaveBeenCalled()
  })

  it('uses only governed execution for selected enforce requests', async () => {
    const legacy = vi.fn(async () => 'legacy-response')
    const governed = vi.fn(async () => 'governed-response')

    const result = await executeGovernedStream({
      routeContext: context('Research the current CEO of Apple'),
      rolloutDecision: decision('enforce', true),
      executeLegacy: legacy,
      executeGoverned: governed
    })

    expect(result).toEqual({ path: 'governed', value: 'governed-response' })
    expect(governed).toHaveBeenCalledTimes(1)
    expect(legacy).not.toHaveBeenCalled()
  })

  it('never falls back to legacy when enforced governed execution fails', async () => {
    const legacy = vi.fn(async () => 'legacy-response')
    const governed = vi.fn(async () => {
      throw new Error('governed chain failed')
    })

    await expect(
      executeGovernedStream({
        routeContext: context('Research the current CEO of Apple'),
        rolloutDecision: decision('enforce', true),
        executeLegacy: legacy,
        executeGoverned: governed
      })
    ).rejects.toThrow('governed chain failed')

    expect(legacy).not.toHaveBeenCalled()
  })

  it('runs shadow validation before legacy output and never exposes the shadow value', async () => {
    const order: string[] = []
    const shadowOutcome = vi.fn()

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
      onShadowOutcome: shadowOutcome,
      now: (() => {
        const values = [100, 125]
        return () => values.shift() ?? 125
      })()
    })

    expect(order).toEqual(['governed', 'legacy'])
    expect(result).toEqual({ path: 'shadow', value: 'legacy-response' })
    expect(JSON.stringify(result)).not.toContain('secret-governed-draft')
    expect(shadowOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'succeeded',
        durationMs: 25,
        errorClass: null
      })
    )
  })

  it('records shadow failure without changing the legacy result', async () => {
    const observer = vi.fn()

    const result = await executeGovernedStream({
      routeContext: context('Research the current CEO of Apple'),
      rolloutDecision: decision('shadow', true),
      executeGoverned: async () => {
        throw new TypeError('shadow failure')
      },
      executeLegacy: async () => 'legacy-response',
      onShadowOutcome: observer,
      now: () => 100
    })

    expect(result).toEqual({ path: 'shadow', value: 'legacy-response' })
    expect(observer).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorClass: 'TypeError'
      })
    )
  })

  it('does not let observer failure change the user-visible path', async () => {
    const result = await executeGovernedStream({
      routeContext: context('Research the current CEO of Apple'),
      rolloutDecision: decision('shadow', true),
      executeGoverned: async () => 'shadow',
      executeLegacy: async () => 'legacy',
      onShadowOutcome: async () => {
        throw new Error('telemetry unavailable')
      }
    })

    expect(result).toEqual({ path: 'shadow', value: 'legacy' })
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

  it('rejects malformed callbacks before any execution', async () => {
    await expect(
      executeGovernedStream({
        routeContext: context('Research the current CEO of Apple'),
        rolloutDecision: decision('shadow', true),
        executeLegacy: null as never,
        executeGoverned: async () => 'governed'
      })
    ).rejects.toThrow('Invalid governed stream executor callbacks.')
  })
})
