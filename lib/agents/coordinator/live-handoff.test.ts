import { describe, expect, it } from 'vitest'

import {
  createRouteExecutionContext,
  digestRoutePlan,
  type RouteExecutionContext
} from '@/lib/ai/router/execution-context'
import { buildDeterministicRouteFloor } from '@/lib/ai/router/router-admission'
import type { SearchResultItem } from '@/lib/types'

import { evaluateLiveCoordinatorHandoff } from './live-handoff'

const now = new Date('2026-07-11T12:00:00.000Z')

function routeContext(query: string): RouteExecutionContext {
  const routePlan = buildDeterministicRouteFloor({ query })
  return createRouteExecutionContext({
    routePlan,
    routeDigest: digestRoutePlan(routePlan)
  })
}

function result(
  url: string,
  overrides: Partial<SearchResultItem> = {}
): SearchResultItem {
  return {
    title: 'Independent source',
    url,
    content:
      'Photosynthesis converts light energy into chemical energy in plants.',
    publishedAt: '2026-07-10T12:00:00.000Z',
    ...overrides
  }
}

describe('AI-I3D live Coordinator handoff', () => {
  it('permits pre-composition only from verified route and adequate real evidence', () => {
    const context = routeContext('Explain photosynthesis')
    const handoff = evaluateLiveCoordinatorHandoff({
      routeContext: context,
      query: 'Explain photosynthesis',
      searchResults: [
        result('https://example.edu/photosynthesis'),
        result('https://science.example.org/photosynthesis')
      ],
      completedRoles: ['router', 'retriever'],
      retrievedAt: now,
      now
    })

    expect(handoff.evaluation.repairPlan.canProceedToComposition).toBe(true)
    expect(handoff.evaluation.decision.stopConditions).toContain(
      'composition_allowed'
    )
    expect(
      handoff.evaluation.policyResults.find(
        policy => policy.id === 'role_completion'
      )?.passed
    ).toBe(true)
  })

  it('blocks composition when a required retrieval-stage role is incomplete', () => {
    const context = routeContext('Explain photosynthesis')
    const handoff = evaluateLiveCoordinatorHandoff({
      routeContext: context,
      query: 'Explain photosynthesis',
      searchResults: [
        result('https://example.edu/photosynthesis'),
        result('https://science.example.org/photosynthesis')
      ],
      completedRoles: ['router'],
      retrievedAt: now,
      now
    })

    expect(handoff.evaluation.repairPlan.canProceedToComposition).toBe(false)
    expect(handoff.evaluation.repairPlan.actions).toContain('run_retriever')
  })

  it('does not fabricate entity grounding from ordinary search evidence', () => {
    const query = 'Who is the current CEO of OpenAI?'
    const context = routeContext(query)
    const handoff = evaluateLiveCoordinatorHandoff({
      routeContext: context,
      query,
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
      retrievedAt: now,
      now
    })

    expect(handoff.evaluation.repairPlan.canProceedToComposition).toBe(false)
    expect(handoff.evaluation.repairPlan.actions).toContain(
      'run_entity_grounding'
    )
  })

  it('rejects a forged or tampered route context', () => {
    const context = routeContext('Explain photosynthesis')
    const forged = {
      routePlan: { ...context.routePlan, maxToolCalls: 99 },
      routeDigest: context.routeDigest
    } as RouteExecutionContext

    expect(() =>
      evaluateLiveCoordinatorHandoff({
        routeContext: forged,
        query: 'Explain photosynthesis',
        searchResults: [],
        completedRoles: ['router', 'retriever'],
        now
      })
    ).toThrow('Invalid Router execution context.')
  })

  it('rejects unbounded evidence batches before graph construction', () => {
    const context = routeContext('Explain photosynthesis')
    const searchResults = Array.from({ length: 501 }, (_, index) =>
      result(`https://example-${index}.com/report`)
    )

    expect(() =>
      evaluateLiveCoordinatorHandoff({
        routeContext: context,
        query: 'Explain photosynthesis',
        searchResults,
        completedRoles: ['router', 'retriever'],
        now
      })
    ).toThrow('Coordinator search result limit exceeded.')
  })

  it('rejects non-string queries without executing string methods', () => {
    const context = routeContext('Explain photosynthesis')

    expect(() =>
      evaluateLiveCoordinatorHandoff({
        routeContext: context,
        query: null,
        searchResults: [],
        completedRoles: ['router', 'retriever'],
        now
      } as unknown as Parameters<typeof evaluateLiveCoordinatorHandoff>[0])
    ).toThrow('Invalid Coordinator query.')
  })

  it('rejects missing route contexts through the canonical verifier', () => {
    expect(() =>
      evaluateLiveCoordinatorHandoff({
        routeContext: null,
        query: 'Explain photosynthesis',
        searchResults: [],
        completedRoles: ['router', 'retriever'],
        now
      } as unknown as Parameters<typeof evaluateLiveCoordinatorHandoff>[0])
    ).toThrow('Invalid Router execution context.')
  })

  it('does not treat null timestamps as the Unix epoch', () => {
    const context = routeContext('Explain photosynthesis')
    const handoff = evaluateLiveCoordinatorHandoff({
      routeContext: context,
      query: 'Explain photosynthesis',
      searchResults: [
        result('https://example.edu/photosynthesis'),
        result('https://science.example.org/photosynthesis')
      ],
      completedRoles: ['router', 'retriever'],
      retrievedAt: null,
      now: null
    })

    expect(handoff.state.evidenceGraph.items).toHaveLength(2)
  })
})
