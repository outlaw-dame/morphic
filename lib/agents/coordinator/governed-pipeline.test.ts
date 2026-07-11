import { describe, expect, it, vi } from 'vitest'

import {
  createRouteExecutionContext,
  digestRoutePlan
} from '@/lib/ai/router/execution-context'
import { buildDeterministicRouteFloor } from '@/lib/ai/router/router-admission'
import type { SearchResultItem } from '@/lib/types'

import {
  type GovernedRetrievalAdapter,
  runGovernedResearchPipeline
} from './governed-pipeline'

const now = new Date('2026-07-11T12:00:00.000Z')

function context(query: string) {
  const routePlan = buildDeterministicRouteFloor({ query })
  return createRouteExecutionContext({
    routePlan,
    routeDigest: digestRoutePlan(routePlan)
  })
}

function result(url: string): SearchResultItem {
  return {
    title: 'Independent source',
    url,
    content: 'Plants convert light energy into chemical energy.',
    publishedAt: '2026-07-10T12:00:00.000Z'
  }
}

describe('AI-I3E governed two-stage pipeline', () => {
  it('runs composition only after the Coordinator permits it', async () => {
    const query = 'Explain photosynthesis'
    const compose = vi.fn(async () => 'answer')

    const response = await runGovernedResearchPipeline({
      query,
      routeContext: context(query),
      retrieval: {
        retrieve: vi.fn(async () => ({
          searchResults: [
            result('https://example.edu/report'),
            result('https://science.example.org/report')
          ],
          completedRoles: ['router', 'retriever'] as const,
          retrievedAt: now
        }))
      },
      composition: { compose },
      now
    })

    expect(response.output).toBe('answer')
    expect(response.attempts).toBe(1)
    expect(compose).toHaveBeenCalledTimes(1)
    expect(
      response.handoff.evaluation.repairPlan.canProceedToComposition
    ).toBe(true)
  })

  it('performs a bounded repair retrieval before composition', async () => {
    const query = 'Explain photosynthesis'
    const retrieve = vi
      .fn()
      .mockResolvedValueOnce({
        searchResults: [],
        completedRoles: ['router', 'retriever'] as const,
        retrievedAt: now
      })
      .mockResolvedValueOnce({
        searchResults: [
          result('https://example.edu/report'),
          result('https://science.example.org/report')
        ],
        completedRoles: ['router', 'retriever'] as const,
        retrievedAt: now
      })

    const response = await runGovernedResearchPipeline({
      query,
      routeContext: context(query),
      retrieval: { retrieve },
      composition: { compose: async () => 'answer' },
      maxRetrievalAttempts: 2,
      now
    })

    expect(response.attempts).toBe(2)
    expect(retrieve).toHaveBeenCalledTimes(2)
    expect(retrieve.mock.calls[1]?.[0].repairActions).toContain(
      'retrieve_more_sources'
    )
  })

  it('never composes when required entity grounding remains absent', async () => {
    const query = 'Who is the current CEO of OpenAI?'
    const compose = vi.fn(async () => 'unsafe answer')

    await expect(
      runGovernedResearchPipeline({
        query,
        routeContext: context(query),
        retrieval: {
          retrieve: async () => ({
            searchResults: [
              result('https://example.com/openai'),
              result('https://other.example.net/openai')
            ],
            completedRoles: [
              'router',
              'retriever',
              'fusion_planner',
              'source_quality',
              'entity_grounding'
            ] as const,
            retrievedAt: now
          })
        },
        composition: { compose },
        maxRetrievalAttempts: 1,
        now
      })
    ).rejects.toThrow('Coordinator blocked composition')

    expect(compose).not.toHaveBeenCalled()
  })

  it('rejects invalid retrieval attempt limits before invoking adapters', async () => {
    const query = 'Explain photosynthesis'
    const retrieve = vi.fn()
    const compose = vi.fn()

    await expect(
      runGovernedResearchPipeline({
        query,
        routeContext: context(query),
        retrieval: { retrieve },
        composition: { compose },
        maxRetrievalAttempts: 6,
        now
      })
    ).rejects.toThrow('Invalid retrieval attempt limit.')

    expect(retrieve).not.toHaveBeenCalled()
    expect(compose).not.toHaveBeenCalled()
  })

  it('rejects null retrieval adapter results before property access', async () => {
    const query = 'Explain photosynthesis'
    const compose = vi.fn()
    const retrieval = {
      retrieve: async () => null
    } as unknown as GovernedRetrievalAdapter

    await expect(
      runGovernedResearchPipeline({
        query,
        routeContext: context(query),
        retrieval,
        composition: { compose },
        now
      })
    ).rejects.toThrow('Invalid retrieval result returned from adapter.')

    expect(compose).not.toHaveBeenCalled()
  })

  it('falls back to Error when DOMException is unavailable', async () => {
    const query = 'Explain photosynthesis'
    const controller = new AbortController()
    controller.abort('cancelled without DOMException')
    vi.stubGlobal('DOMException', undefined)

    try {
      await expect(
        runGovernedResearchPipeline({
          query,
          routeContext: context(query),
          retrieval: { retrieve: vi.fn() },
          composition: { compose: vi.fn() },
          signal: controller.signal,
          now
        })
      ).rejects.toThrow('cancelled without DOMException')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('propagates cancellation before composition', async () => {
    const query = 'Explain photosynthesis'
    const controller = new AbortController()
    const compose = vi.fn(async () => 'answer')

    await expect(
      runGovernedResearchPipeline({
        query,
        routeContext: context(query),
        retrieval: {
          retrieve: async () => {
            controller.abort(new Error('cancelled'))
            return {
              searchResults: [
                result('https://example.edu/report'),
                result('https://science.example.org/report')
              ],
              completedRoles: ['router', 'retriever'] as const,
              retrievedAt: now
            }
          }
        },
        composition: { compose },
        signal: controller.signal,
        now
      })
    ).rejects.toThrow('cancelled')

    expect(compose).not.toHaveBeenCalled()
  })
})