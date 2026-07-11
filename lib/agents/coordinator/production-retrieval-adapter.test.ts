import { describe, expect, it, vi } from 'vitest'

import {
  createRouteExecutionContext,
  digestRoutePlan
} from '@/lib/ai/router/execution-context'
import { buildDeterministicRouteFloor } from '@/lib/ai/router/router-admission'

import { createProductionRetrievalAdapter } from './production-retrieval-adapter'

function context(query: string) {
  const routePlan = buildDeterministicRouteFloor({ query })
  return createRouteExecutionContext({
    routePlan,
    routeDigest: digestRoutePlan(routePlan)
  })
}

function validResult() {
  return {
    searchResults: [
      {
        title: 'Source',
        url: 'https://example.org/source',
        content: 'Evidence'
      }
    ],
    completedRoles: ['router', 'retriever'] as const,
    retrievedAt: '2026-07-11T12:00:00.000Z'
  }
}

function retrieveInput(query = 'Explain photosynthesis') {
  return {
    query,
    routeContext: context(query),
    attempt: 1,
    repairActions: [] as readonly string[]
  }
}

describe('AI-I3F production retrieval adapter', () => {
  it('passes an immutable verified route to the retrieval executor', async () => {
    const execute = vi.fn(async input => {
      expect(Object.isFrozen(input)).toBe(true)
      expect(Object.isFrozen(input.routeContext)).toBe(true)
      expect(Object.isFrozen(input.routeContext.routePlan)).toBe(true)
      expect(Object.isFrozen(input.repairActions)).toBe(true)
      return validResult()
    })
    const adapter = createProductionRetrievalAdapter({ execute })
    const routeContext = context('Explain photosynthesis')

    const result = await adapter.retrieve({
      query: '  Explain photosynthesis  ',
      routeContext,
      attempt: 1,
      repairActions: ['retrieve_more_sources']
    })

    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0]?.[0].query).toBe('Explain photosynthesis')
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.searchResults)).toBe(true)
    expect(Object.isFrozen(result.searchResults[0])).toBe(true)
    expect(Object.isFrozen(result.completedRoles)).toBe(true)
    expect(result.retrievedAt).toBeInstanceOf(Date)
  })

  it('rejects a tampered Router execution context before retrieval', async () => {
    const execute = vi.fn()
    const adapter = createProductionRetrievalAdapter({ execute })
    const routeContext = context('Explain photosynthesis')

    await expect(
      adapter.retrieve({
        query: 'Explain photosynthesis',
        routeContext: {
          ...routeContext,
          routeDigest: '0'.repeat(64)
        },
        attempt: 1,
        repairActions: []
      })
    ).rejects.toThrow('Invalid Router execution context.')

    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects malformed executor results at the adapter boundary', async () => {
    const adapter = createProductionRetrievalAdapter({
      execute: async () => ({
        searchResults: [null],
        completedRoles: ['retriever'],
        retrievedAt: '2026-07-11T12:00:00.000Z'
      })
    })

    await expect(adapter.retrieve(retrieveInput())).rejects.toThrow(
      'Invalid production retrieval search result.'
    )
  })

  it('rejects search results without non-empty evidence content', async () => {
    const adapter = createProductionRetrievalAdapter({
      execute: async () => ({
        searchResults: [
          {
            title: 'Source',
            url: 'https://example.org/source',
            content: '   '
          }
        ],
        completedRoles: ['retriever'],
        retrievedAt: '2026-07-11T12:00:00.000Z'
      })
    })

    await expect(adapter.retrieve(retrieveInput())).rejects.toThrow(
      'Invalid production retrieval search result.'
    )
  })

  it('rejects arbitrary completed-role strings', async () => {
    const adapter = createProductionRetrievalAdapter({
      execute: async () => ({
        ...validResult(),
        completedRoles: ['retriever', 'untrusted_role']
      })
    })

    await expect(adapter.retrieve(retrieveInput())).rejects.toThrow(
      'Invalid production retrieval completed role.'
    )
  })

  it('accepts numeric retrieval timestamps without string coercion', async () => {
    const timestamp = Date.parse('2026-07-11T12:00:00.000Z')
    const adapter = createProductionRetrievalAdapter({
      execute: async () => ({
        ...validResult(),
        retrievedAt: timestamp
      })
    })

    const result = await adapter.retrieve(retrieveInput())
    expect(result.retrievedAt).toEqual(new Date(timestamp))
  })

  it('rejects unsupported timestamp objects', async () => {
    const adapter = createProductionRetrievalAdapter({
      execute: async () => ({
        ...validResult(),
        retrievedAt: { toString: () => '2026-07-11T12:00:00.000Z' }
      })
    })

    await expect(adapter.retrieve(retrieveInput())).rejects.toThrow(
      'Invalid production retrieval timestamp.'
    )
  })

  it('propagates cancellation before invoking retrieval', async () => {
    const execute = vi.fn()
    const adapter = createProductionRetrievalAdapter({ execute })
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))

    await expect(
      adapter.retrieve({
        ...retrieveInput(),
        signal: controller.signal
      })
    ).rejects.toThrow('cancelled')

    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects oversized result sets', async () => {
    const adapter = createProductionRetrievalAdapter({
      execute: async () => ({
        searchResults: Array.from({ length: 501 }, (_, index) => ({
          title: `Source ${index}`,
          url: `https://example.org/${index}`,
          content: `Content ${index}`
        })),
        completedRoles: ['retriever'],
        retrievedAt: '2026-07-11T12:00:00.000Z'
      })
    })

    await expect(adapter.retrieve(retrieveInput())).rejects.toThrow(
      'Invalid production retrieval search results.'
    )
  })
})
