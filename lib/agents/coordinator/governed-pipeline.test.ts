import { describe, expect, it, vi } from 'vitest'

import {
  createRouteExecutionContext,
  digestRoutePlan
} from '@/lib/ai/router/execution-context'
import { buildDeterministicRouteFloor } from '@/lib/ai/router/router-admission'
import type { SearchResultItem } from '@/lib/types'

import { runGovernedResearchPipeline } from './governed-pipeline'

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
          completedRoles: ['router', 'retriever'],
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
        searchResults: [result('https://example.edu/report')],
        completedRoles: ['router', 'retriever'],
        retrievedAt: now
      })
      .mockResolvedValueOnce({
        searchResults: [
          result('https://example.edu/report'),
          result('https://science.example.org/report')
        ],
        completedRoles: ['router', 'retriever'],
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
      'retrieve_independent_sources'
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
            ],
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

  it('rejects unsupported repair actions instead of passing them to retrieval', async () => {
    const query = 'Explain photosynthesis'
    const routeContext = context(query)
    const retrieve = vi.fn(async () => ({
      searchResults: [],
      completedRoles: ['router', 'retriever'],
      retrievedAt: now
    }))

    const original = routeContext.routePlan.requiredSourceClasses
    Object.defineProperty(routeContext.routePlan, 'requiredSourceClasses', {
      value: original,
      configurable: false
    })

    await expect(
      runGovernedResearchPipeline({
        query,
        routeContext,
        retrieval: { retrieve },
        composition: { compose: async () => 'answer' },
        maxRetrievalAttempts: 1,
        now
      })
    ).rejects.toThrow('Coordinator blocked composition')
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
              completedRoles: ['router', 'retriever'],
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
