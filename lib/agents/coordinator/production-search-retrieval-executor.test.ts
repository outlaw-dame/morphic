import { describe, expect, it, vi } from 'vitest'

import {
  createRouteExecutionContext,
  digestRoutePlan
} from '@/lib/ai/router/execution-context'
import { buildDeterministicRouteFloor } from '@/lib/ai/router/router-admission'

import { createProductionRetrievalAdapter } from './production-retrieval-adapter'
import { createProductionSearchRetrievalExecutor } from './production-search-retrieval-executor'

function context(query: string) {
  const routePlan = buildDeterministicRouteFloor({ query })
  return createRouteExecutionContext({
    routePlan,
    routeDigest: digestRoutePlan(routePlan)
  })
}

function result() {
  return {
    title: 'Authoritative result',
    url: 'https://example.gov/source',
    content: 'A sufficiently detailed authoritative source result.'
  }
}

function adapter(search: ReturnType<typeof vi.fn>) {
  return createProductionRetrievalAdapter(
    createProductionSearchRetrievalExecutor({ search })
  )
}

describe('production governed search retrieval executor', () => {
  it('reports only roles actually completed by the search stack', async () => {
    const search = vi.fn(async () => ({
      results: [result()],
      images: [],
      query: 'Who founded Example Corp?',
      number_of_results: 1
    }))

    const output = await adapter(search).retrieve({
      query: 'Who founded Example Corp?',
      routeContext: context('Who founded Example Corp?'),
      attempt: 1,
      repairActions: []
    })

    expect(output.completedRoles).toEqual([
      'router',
      'retriever',
      'source_quality',
      'entity_grounding'
    ])
    expect(output.completedRoles).not.toContain('fusion_planner')
    expect(output.searchResults).toHaveLength(1)
    expect(Object.isFrozen(output.searchResults)).toBe(true)
  })

  it('increases bounded retrieval depth for approved repair actions', async () => {
    const search = vi.fn(async () => ({
      results: [result()],
      images: [],
      query: 'Research current concussion treatment guidance',
      number_of_results: 1
    }))

    await adapter(search).retrieve({
      query: 'Research current concussion treatment guidance',
      routeContext: context('Research current concussion treatment guidance'),
      attempt: 3,
      repairActions: ['retrieve_more_sources']
    })

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        maxResults: 70,
        searchDepth: 'advanced'
      })
    )
  })

  it('rejects unsupported repair actions before search', async () => {
    const search = vi.fn()

    await expect(
      adapter(search).retrieve({
        query: 'Research TypeScript',
        routeContext: context('Research TypeScript'),
        attempt: 1,
        repairActions: ['select_stronger_model']
      })
    ).rejects.toThrow('Unsupported governed search repair action.')
    expect(search).not.toHaveBeenCalled()
  })

  it('preserves cancellation before search', async () => {
    const controller = new AbortController()
    controller.abort(new Error('user cancelled search'))
    const search = vi.fn()

    await expect(
      adapter(search).retrieve({
        query: 'Research TypeScript',
        routeContext: context('Research TypeScript'),
        attempt: 1,
        repairActions: [],
        signal: controller.signal
      })
    ).rejects.toThrow('user cancelled search')
    expect(search).not.toHaveBeenCalled()
  })

  it('rejects malformed search responses', async () => {
    const search = vi.fn(async () => null)

    await expect(
      adapter(search).retrieve({
        query: 'Research TypeScript',
        routeContext: context('Research TypeScript'),
        attempt: 1,
        repairActions: []
      })
    ).rejects.toThrow('Invalid governed search response.')
  })
})
