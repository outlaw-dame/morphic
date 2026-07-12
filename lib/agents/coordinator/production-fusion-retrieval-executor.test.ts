import { describe, expect, it, vi } from 'vitest'

import {
  createRouteExecutionContext,
  digestRoutePlan
} from '@/lib/ai/router/execution-context'
import { buildDeterministicRouteFloor } from '@/lib/ai/router/router-admission'
import {
  parseRoutePlan,
  type CanonicalRoutePlan,
  type SourceClass
} from '@/lib/ai/schemas'

import { createProductionRetrievalAdapter } from './production-retrieval-adapter'
import {
  createProductionFusionRetrievalExecutor,
  type ProductionFusionRetrievalExecutorOptions
} from './production-fusion-retrieval-executor'
import type {
  ProductionFusionPath,
  ProductionFusionPlan,
  ProductionFusionPlanner
} from './production-fusion-planner-adapter'

const query = 'Research current Example Corp ownership and recent changes.'

type RouteOverrides = Partial<CanonicalRoutePlan>
type ExecutorOverrides = Partial<
  Omit<ProductionFusionRetrievalExecutorOptions, 'planner' | 'searchPort'>
>

function context(overrides: RouteOverrides = {}) {
  const floor = buildDeterministicRouteFloor({ query })
  const routePlan = parseRoutePlan({
    ...floor,
    mode: 'adaptive',
    needsFusionPlanning: true,
    needsFreshness: false,
    needsEntityGrounding: false,
    requiredSourceClasses: [],
    disallowedSourceClasses: ['content_farm', 'scraper_or_aggregator'],
    maxToolCalls: 6,
    ...overrides
  })
  return createRouteExecutionContext({
    routePlan,
    routeDigest: digestRoutePlan(routePlan)
  })
}

function path(
  id: string,
  sourceClass: SourceClass,
  purpose: ProductionFusionPath['purpose'] = 'primary_evidence'
): ProductionFusionPath {
  return Object.freeze({
    id,
    query: `${query} ${id}`,
    sourceClass,
    purpose,
    maxResults: 5,
    requiresFreshness: purpose === 'freshness_check'
  })
}

function planner(paths: readonly ProductionFusionPath[]): ProductionFusionPlanner {
  return Object.freeze({
    async plan(input) {
      return Object.freeze({
        routeDigest: input.routeContext.routeDigest,
        paths: Object.freeze([...paths]),
        reasonCodes: Object.freeze(['test_plan']),
        roleExecution: Object.freeze({})
      }) as unknown as ProductionFusionPlan
    }
  })
}

function searchResult(url: string, title = 'Authoritative source') {
  return {
    title,
    url,
    content: 'A sufficiently detailed source result for the governed test.'
  }
}

function executor(
  paths: readonly ProductionFusionPath[],
  search: ProductionFusionRetrievalExecutorOptions['searchPort']['search'],
  options: ExecutorOverrides = {}
) {
  return createProductionRetrievalAdapter(
    createProductionFusionRetrievalExecutor({
      planner: planner(paths),
      searchPort: { search },
      random: () => 0,
      sleep: async () => undefined,
      now: () => new Date('2026-07-12T18:00:00.000Z'),
      ...options
    })
  )
}

describe('AI-I5 production Fusion retrieval executor', () => {
  it('executes approved lanes, canonicalizes and deduplicates results, and preserves provenance', async () => {
    const paths = [
      path('official', 'official_source'),
      path('news', 'established_news', 'independent_corroboration')
    ]
    const search = vi.fn(async input => ({
      results: [
        searchResult(
          input.sourceClass === 'official_source'
            ? 'https://EXAMPLE.com:443/source?b=2&a=1#fragment'
            : 'https://example.com/source?a=1&b=2'
        )
      ],
      images: [],
      query: input.query,
      number_of_results: 1
    }))

    const output = await executor(paths, search).retrieve({
      query,
      routeContext: context(),
      attempt: 1,
      repairActions: []
    })

    expect(search).toHaveBeenCalledTimes(2)
    expect(output.searchResults).toHaveLength(1)
    expect(output.searchResults[0]?.url).toBe(
      'https://example.com/source?a=1&b=2'
    )
    expect(output.searchResults[0]?.retrievalProvenance).toMatchObject({
      routeDigest: context().routeDigest,
      pathId: 'official',
      sourceClass: 'official_source'
    })
    expect(output.completedRoles).toEqual([
      'router',
      'fusion_planner',
      'retriever'
    ])
    expect(output.fusion?.budget).toEqual({
      toolCallsUsed: 2,
      toolCallsAllowed: 6,
      resultsReturned: 1,
      resultsAllowed: 10
    })
    expect(output.fusion?.outcomes).toHaveLength(2)
  })

  it('enforces bounded concurrency', async () => {
    let active = 0
    let peak = 0
    const search = vi.fn(async input => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active -= 1
      return {
        results: [searchResult(`https://example.com/${input.sourceClass}`)],
        images: [],
        query: input.query
      }
    })

    await executor(
      [
        path('one', 'official_source'),
        path('two', 'established_news'),
        path('three', 'academic_or_peer_reviewed')
      ],
      search,
      { maxConcurrency: 2 }
    ).retrieve({
      query,
      routeContext: context(),
      attempt: 1,
      repairActions: []
    })

    expect(peak).toBe(2)
  })

  it('retries only transient reads and honors bounded Retry-After', async () => {
    const sleep = vi.fn(async () => undefined)
    const search = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('busy'), { status: 429, retryAfterMs: 400 })
      )
      .mockResolvedValueOnce({
        results: [searchResult('https://example.com/recovered')],
        images: [],
        query
      })

    const output = await executor(
      [path('retry', 'official_source')],
      search,
      { sleep }
    ).retrieve({
      query,
      routeContext: context({ maxToolCalls: 3 }),
      attempt: 1,
      repairActions: []
    })

    expect(search).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(400, undefined)
    expect(output.fusion?.outcomes[0]).toMatchObject({
      status: 'succeeded',
      attempts: 2
    })
  })

  it('retries provider TimeoutError as a transient idempotent read', async () => {
    const timeout = Object.assign(new Error('provider timeout'), {
      name: 'TimeoutError'
    })
    const search = vi
      .fn()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce({
        results: [searchResult('https://example.com/timeout-recovered')],
        images: [],
        query
      })

    const output = await executor([path('timeout-retry', 'official_source')], search)
      .retrieve({
        query,
        routeContext: context({ maxToolCalls: 2 }),
        attempt: 1,
        repairActions: []
      })

    expect(search).toHaveBeenCalledTimes(2)
    expect(output.fusion?.outcomes[0]).toMatchObject({
      status: 'succeeded',
      attempts: 2
    })
  })

  it('does not retry deterministic failures', async () => {
    const search = vi.fn(async () => {
      throw Object.assign(new Error('invalid request'), { status: 400 })
    })

    await expect(
      executor([path('bad', 'official_source')], search).retrieve({
        query,
        routeContext: context(),
        attempt: 1,
        repairActions: []
      })
    ).rejects.toThrow('All Fusion retrieval paths failed')
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('prevents calls after the route tool budget is consumed', async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))
      .mockResolvedValueOnce({
        results: [searchResult('https://example.com/retry-success')],
        images: [],
        query
      })

    const output = await executor(
      [
        path('retry', 'independent_blog'),
        path('skipped', 'established_news')
      ],
      search,
      { maxConcurrency: 1 }
    ).retrieve({
      query,
      routeContext: context({ maxToolCalls: 2 }),
      attempt: 1,
      repairActions: []
    })

    expect(search).toHaveBeenCalledTimes(2)
    expect(output.fusion?.budget.toolCallsUsed).toBe(2)
    expect(output.fusion?.outcomes).toEqual([
      expect.objectContaining({ pathId: 'retry', status: 'succeeded' }),
      expect.objectContaining({
        pathId: 'skipped',
        status: 'failed',
        errorClass: 'ToolBudgetExceeded',
        attempts: 0
      })
    ])
  })

  it('normalizes optional failure but fails closed for mandatory lanes', async () => {
    const optionalSearch = vi.fn(async input => {
      if (input.sourceClass === 'independent_blog') {
        throw Object.assign(new Error('permanent'), { status: 400 })
      }
      return {
        results: [searchResult('https://example.com/official')],
        images: [],
        query: input.query
      }
    })

    const partial = await executor(
      [
        path('official', 'official_source'),
        path('optional', 'independent_blog')
      ],
      optionalSearch
    ).retrieve({
      query,
      routeContext: context(),
      attempt: 1,
      repairActions: []
    })

    expect(partial.searchResults).toHaveLength(1)
    expect(partial.fusion?.outcomes).toEqual([
      expect.objectContaining({ pathId: 'official', status: 'succeeded' }),
      expect.objectContaining({ pathId: 'optional', status: 'failed' })
    ])

    const mandatorySearch = vi.fn(async input => {
      if (input.pathPurpose === 'freshness_check') {
        throw Object.assign(new Error('permanent'), { status: 400 })
      }
      return {
        results: [searchResult('https://example.com/official')],
        images: [],
        query: input.query
      }
    })

    await expect(
      executor(
        [
          path('official', 'official_source'),
          path('freshness', 'established_news', 'freshness_check')
        ],
        mandatorySearch
      ).retrieve({
        query,
        routeContext: context({ needsFreshness: true }),
        attempt: 1,
        repairActions: []
      })
    ).rejects.toThrow('Mandatory Fusion retrieval path failed: freshness.')
  })

  it('propagates cancellation and does not start later lanes', async () => {
    const controller = new AbortController()
    const search = vi.fn(async () => {
      controller.abort(new Error('user cancelled retrieval'))
      throw new Error('provider aborted')
    })

    await expect(
      executor(
        [path('first', 'official_source'), path('second', 'established_news')],
        search,
        { maxConcurrency: 1 }
      ).retrieve({
        query,
        routeContext: context(),
        attempt: 1,
        repairActions: [],
        signal: controller.signal
      })
    ).rejects.toThrow('user cancelled retrieval')

    expect(search).toHaveBeenCalledTimes(1)
  })

  it('enforces a real per-path timeout without hanging', async () => {
    vi.useFakeTimers()
    try {
      const search = vi.fn(
        input =>
          new Promise<never>((_resolve, reject) => {
            input.signal?.addEventListener(
              'abort',
              () => reject(input.signal?.reason),
              { once: true }
            )
          })
      )
      const promise = executor([path('timeout', 'official_source')], search, {
        perPathTimeoutMs: 250
      }).retrieve({
        query,
        routeContext: context({ maxToolCalls: 1 }),
        attempt: 1,
        repairActions: []
      })
      const rejection = expect(promise).rejects.toThrow(
        'All Fusion retrieval paths failed'
      )

      await vi.advanceTimersByTimeAsync(250)
      await rejection
      expect(search).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
