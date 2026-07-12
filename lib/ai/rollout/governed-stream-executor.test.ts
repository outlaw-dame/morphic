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

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('governed stream executor', () => {
  it('keeps explicit non-research chat on the quick legacy path', async () => {
    const legacy = vi.fn(async () => 'quick-response')
    const governed = vi.fn(async () => 'governed-response')

    const result = await executeGovernedStream({
      routeContext: context('Hello'),
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

  it('returns the legacy response without waiting for shadow completion', async () => {
    let resolveGoverned: ((value: string) => void) | undefined
    const governed = new Promise<string>(resolve => {
      resolveGoverned = resolve
    })
    const observer = vi.fn()

    const result = await executeGovernedStream({
      routeContext: context('Research the current CEO of Apple'),
      rolloutDecision: decision('shadow', true),
      executeGoverned: () => governed,
      executeLegacy: async () => 'legacy-response',
      onShadowOutcome: observer
    })

    expect(result).toEqual({ path: 'shadow', value: 'legacy-response' })
    expect(observer).not.toHaveBeenCalled()

    resolveGoverned?.('secret-governed-draft')
    await flushMicrotasks()

    expect(observer).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'succeeded', errorClass: null })
    )
    expect(JSON.stringify(result)).not.toContain('secret-governed-draft')
  })

  it('isolates shadow and observer failures from the legacy response', async () => {
    const observer = vi.fn(async () => {
      throw new Error('telemetry unavailable')
    })

    const result = await executeGovernedStream({
      routeContext: context('Research the current CEO of Apple'),
      rolloutDecision: decision('shadow', true),
      executeGoverned: async () => {
        throw new Error('shadow failed')
      },
      executeLegacy: async () => 'legacy-response',
      onShadowOutcome: observer
    })

    expect(result).toEqual({ path: 'shadow', value: 'legacy-response' })
    await flushMicrotasks()
    expect(observer).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', errorClass: 'Error' })
    )
  })

  it('contains hostile Error names inside shadow telemetry', async () => {
    const observer = vi.fn()
    const hostile = new Error('shadow failure')
    Object.defineProperty(hostile, 'name', {
      configurable: true,
      value: {
        slice: () => {
          throw new Error('hostile name executed')
        }
      }
    })

    const result = await executeGovernedStream({
      routeContext: context('Research the current CEO of Apple'),
      rolloutDecision: decision('shadow', true),
      executeGoverned: async () => {
        throw hostile
      },
      executeLegacy: async () => 'legacy-response',
      onShadowOutcome: observer
    })

    expect(result).toEqual({ path: 'shadow', value: 'legacy-response' })
    await flushMicrotasks()
    expect(observer).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorClass: 'UnknownError'
      })
    )
  })

  it('propagates caller cancellation without substituting a fallback', async () => {
    const controller = new AbortController()
    const legacy = vi.fn(async () => {
      controller.abort(new Error('request cancelled'))
      return 'legacy-response'
    })

    await expect(
      executeGovernedStream({
        routeContext: context('Research the current CEO of Apple'),
        rolloutDecision: decision('shadow', true),
        signal: controller.signal,
        executeGoverned: async () => 'shadow-response',
        executeLegacy: legacy
      })
    ).rejects.toThrow('request cancelled')

    expect(legacy).toHaveBeenCalledTimes(1)
  })
})
