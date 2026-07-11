import { describe, expect, it, vi } from 'vitest'

import {
  createRouteExecutionContext,
  digestRoutePlan,
  type RouteExecutionContext
} from '@/lib/ai/router/execution-context'
import { buildDeterministicRouteFloor } from '@/lib/ai/router/router-admission'
import type { ModelRole } from '@/lib/ai/schemas'
import type { SearchResultItem } from '@/lib/types'

import { runGovernedResearchPipeline } from './governed-research-pipeline'

const now = new Date('2026-07-11T12:00:00.000Z')

function routeContext(query: string): RouteExecutionContext {
  const routePlan = buildDeterministicRouteFloor({ query })
  return createRouteExecutionContext({
    routePlan,
    routeDigest: digestRoutePlan(routePlan)
  })
}

function evidence(url: string): SearchResultItem {
  return {
    title: 'Independent evidence',
    url,
    content: 'Photosynthesis converts light energy into chemical energy.',
    publishedAt: '2026-07-10T12:00:00.000Z'
  }
}

function retrievalRoles(context: RouteExecutionContext): ModelRole[] {
  const roles = new Set<ModelRole>(['router'])
  if (context.routePlan.requiresResearch) roles.add('retriever')
  if (context.routePlan.needsFusionPlanning) roles.add('fusion_planner')
  if (context.routePlan.needsSourceQuality) roles.add('source_quality')
  if (context.routePlan.needsEntityGrounding) roles.add('entity_grounding')
  return [...roles]
}

function releaseRoles(context: RouteExecutionContext): ModelRole[] {
  const roles = new Set<ModelRole>(retrievalRoles(context))
  roles.add('answer_composer')
  if (context.routePlan.needsAdvisorReview) roles.add('advisor')
  if (context.routePlan.needsCitationVerification) {
    roles.add('citation_verifier')
  }
  return [...roles]
}

describe('governed two-stage research pipeline', () => {
  it('never calls composition when the Coordinator blocks retrieval evidence', async () => {
    const context = routeContext('Explain photosynthesis')
    const compose = vi.fn()

    const result = await runGovernedResearchPipeline({
      query: 'Explain photosynthesis',
      routeContext: context,
      maxRetrievalAttempts: 1,
      now,
      retrieve: async () => ({
        searchResults: [],
        completedRoles: retrievalRoles(context),
        retrievedAt: now
      }),
      compose
    })

    expect(result.status).toBe('blocked')
    expect(result.phase).toBe('pre_composition')
    expect(compose).not.toHaveBeenCalled()
  })

  it('passes repair actions into a bounded second retrieval attempt', async () => {
    const context = routeContext('Explain photosynthesis')
    const retrieve = vi
      .fn()
      .mockResolvedValueOnce({
        searchResults: [evidence('https://example.edu/report')],
        completedRoles: retrievalRoles(context),
        retrievedAt: now
      })
      .mockResolvedValueOnce({
        searchResults: [
          evidence('https://example.edu/report'),
          evidence('https://science.example.org/report')
        ],
        completedRoles: retrievalRoles(context),
        retrievedAt: now
      })

    const result = await runGovernedResearchPipeline({
      query: 'Explain photosynthesis',
      routeContext: context,
      maxRetrievalAttempts: 2,
      now,
      retrieve,
      compose: async () => ({
        output: 'approved answer',
        completedRoles: releaseRoles(context)
      })
    })

    expect(retrieve).toHaveBeenCalledTimes(2)
    expect(retrieve.mock.calls[1]?.[0].repairActions).toContain(
      'retrieve_independent_sources'
    )
    expect(result).toMatchObject({
      status: 'released',
      attempts: 2,
      output: 'approved answer'
    })
  })

  it('withholds composed output when release-stage roles are incomplete', async () => {
    const context = routeContext('Explain photosynthesis')

    const result = await runGovernedResearchPipeline({
      query: 'Explain photosynthesis',
      routeContext: context,
      now,
      retrieve: async () => ({
        searchResults: [
          evidence('https://example.edu/report'),
          evidence('https://science.example.org/report')
        ],
        completedRoles: retrievalRoles(context),
        retrievedAt: now
      }),
      compose: async () => ({
        output: 'candidate that must not be released',
        completedRoles: ['answer_composer']
      })
    })

    expect(result.status).toBe('blocked')
    expect(result.phase).toBe('pre_release')
    expect('output' in result).toBe(false)
  })

  it('releases output only after both Coordinator gates pass', async () => {
    const context = routeContext('Explain photosynthesis')

    const result = await runGovernedResearchPipeline({
      query: 'Explain photosynthesis',
      routeContext: context,
      now,
      retrieve: async () => ({
        searchResults: [
          evidence('https://example.edu/report'),
          evidence('https://science.example.org/report')
        ],
        completedRoles: retrievalRoles(context),
        retrievedAt: now
      }),
      compose: async () => ({
        output: 'released answer',
        completedRoles: releaseRoles(context)
      })
    })

    expect(result.status).toBe('released')
    if (result.status === 'released') {
      expect(result.output).toBe('released answer')
      expect(result.preComposition.repairPlan.canProceedToComposition).toBe(true)
      expect(result.preRelease.repairPlan.canProceedToComposition).toBe(true)
    }
  })

  it('propagates cancellation and never invokes adapters after abort', async () => {
    const context = routeContext('Explain photosynthesis')
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    const retrieve = vi.fn()
    const compose = vi.fn()

    await expect(
      runGovernedResearchPipeline({
        query: 'Explain photosynthesis',
        routeContext: context,
        signal: controller.signal,
        retrieve,
        compose
      })
    ).rejects.toThrow('cancelled')

    expect(retrieve).not.toHaveBeenCalled()
    expect(compose).not.toHaveBeenCalled()
  })

  it('caps retrieval repair attempts at three', async () => {
    const context = routeContext('Explain photosynthesis')
    const retrieve = vi.fn(async () => ({
      searchResults: [],
      completedRoles: retrievalRoles(context),
      retrievedAt: now
    }))

    const result = await runGovernedResearchPipeline({
      query: 'Explain photosynthesis',
      routeContext: context,
      maxRetrievalAttempts: 99,
      now,
      retrieve,
      compose: vi.fn()
    })

    expect(result.status).toBe('blocked')
    expect(result.attempts).toBe(3)
    expect(retrieve).toHaveBeenCalledTimes(3)
  })
})
