import { describe, expect, it, vi } from 'vitest'

import {
  createRouteExecutionContext,
  digestRoutePlan
} from '@/lib/ai/router/execution-context'
import { buildDeterministicRouteFloor } from '@/lib/ai/router/router-admission'
import { parseRoutePlan } from '@/lib/ai/schemas'

import {
  createProductionEntityGroundingAdapter,
  type GovernedEntityProviderPort
} from './production-entity-grounding'

const query = 'Who founded Example Corp?'

function route(needsEntityGrounding = true) {
  const floor = buildDeterministicRouteFloor({ query })
  const routePlan = parseRoutePlan({
    ...floor,
    requiresResearch: true,
    needsEntityGrounding,
    mode: 'adaptive'
  })
  return createRouteExecutionContext({
    routePlan,
    routeDigest: digestRoutePlan(routePlan)
  })
}

function wikidataCandidate(label = 'Example Corp', id = 'Q123') {
  return {
    label,
    matchedText: 'Example Corp',
    wikidataId: id,
    wikidataUrl: `https://www.wikidata.org/wiki/${id}`,
    source: 'wikidata' as const,
    confidence: 0.9
  }
}

function dbpediaCandidate(
  label = 'Example Corp',
  uri = 'https://dbpedia.org/resource/Example_Corp'
) {
  return {
    label,
    matchedText: 'Example Corp',
    dbpediaUri: uri,
    dbpediaUrl: uri,
    source: 'dbpedia' as const,
    confidence: 0.8
  }
}

function port(
  search: GovernedEntityProviderPort['search']
): GovernedEntityProviderPort {
  return Object.freeze({ search })
}

function adapter(
  wikidata: GovernedEntityProviderPort,
  dbpedia: GovernedEntityProviderPort,
  overrides: Record<string, unknown> = {}
) {
  return createProductionEntityGroundingAdapter({
    executionId: 'execution_entity_00000001',
    wikidata,
    dbpedia,
    limits: {
      maxMentions: 1,
      maxCandidatesPerProvider: 2,
      maxResolvedEntities: 2,
      maxCanonicalIdsPerOutcome: 2,
      maxProviderCalls: 4,
      maxConcurrency: 2,
      perProviderTimeoutMs: 1_000,
      maxAttemptsPerProvider: 2,
      baseRetryDelayMs: 10,
      maxRetryDelayMs: 100
    },
    random: () => 0,
    sleep: async () => undefined,
    now: () => new Date('2026-07-13T00:00:00.000Z'),
    ...overrides
  })
}

describe('AI-I7 production entity grounding adapter', () => {
  it('binds canonical provider outcomes to the route and execution', async () => {
    const wikidata = port(vi.fn(async () => [wikidataCandidate()]))
    const dbpedia = port(vi.fn(async () => [dbpediaCandidate()]))

    const result = await adapter(wikidata, dbpedia).ground({
      query,
      results: [],
      routeContext: route()
    })

    expect(result.routeDigest).toBe(route().routeDigest)
    expect(result.executionId).toBe('execution_entity_00000001')
    expect(result.outcomes).toHaveLength(2)
    expect(result.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'wikidata',
          status: 'succeeded',
          canonicalIds: ['Q123'],
          attempts: 1,
          networkCallStarted: true
        }),
        expect.objectContaining({
          provider: 'dbpedia',
          status: 'succeeded',
          canonicalIds: ['https://dbpedia.org/resource/Example_Corp'],
          attempts: 1,
          networkCallStarted: true
        })
      ])
    )
    expect(result.resolvedEntities).toHaveLength(1)
    expect(result.resolvedEntities[0]?.source).toBe('both')
    expect(result.completed).toBe(true)
    expect(result.reasonCodes).toContain('entity_grounding_completed')
  })

  it('completes without provider calls when no entity mention is extractable', async () => {
    const wikidataSearch = vi.fn()
    const dbpediaSearch = vi.fn()

    const result = await adapter(
      port(wikidataSearch),
      port(dbpediaSearch)
    ).ground({
      query: '??',
      results: [],
      routeContext: route()
    })

    expect(result.mentions).toEqual([])
    expect(result.outcomes).toEqual([])
    expect(result.completed).toBe(true)
    expect(result.reasonCodes).toContain('entity_grounding_completed')
    expect(wikidataSearch).not.toHaveBeenCalled()
    expect(dbpediaSearch).not.toHaveBeenCalled()
  })

  it('rejects routes that do not authorize entity grounding before provider calls', async () => {
    const wikidataSearch = vi.fn()
    const dbpediaSearch = vi.fn()

    await expect(
      adapter(port(wikidataSearch), port(dbpediaSearch)).ground({
        query,
        results: [],
        routeContext: route(false)
      })
    ).rejects.toThrow('Router did not authorize entity grounding.')

    expect(wikidataSearch).not.toHaveBeenCalled()
    expect(dbpediaSearch).not.toHaveBeenCalled()
  })

  it('records bounded provider failures while retaining the other provider evidence', async () => {
    const wikidata = port(async () => {
      throw Object.assign(new Error('rate limited'), {
        status: 429,
        retryAfterMs: 20
      })
    })
    const dbpedia = port(async () => [dbpediaCandidate()])

    const result = await adapter(wikidata, dbpedia).ground({
      query,
      results: [],
      routeContext: route()
    })

    expect(result.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'wikidata',
          status: 'failed',
          failureClass: 'transient_provider_failure',
          attempts: 2,
          reasonCodes: ['provider_rate_limited']
        }),
        expect.objectContaining({
          provider: 'dbpedia',
          status: 'succeeded'
        })
      ])
    )
    expect(result.resolvedEntities).toHaveLength(1)
    expect(result.completed).toBe(true)
  })

  it('retries transient 429 and network failures but not deterministic 4xx', async () => {
    const wikidataSearch = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { status: 429 }))
      .mockResolvedValueOnce([wikidataCandidate()])
    const dbpediaSearch = vi.fn(async () => {
      throw Object.assign(new Error('forbidden'), { status: 403 })
    })

    const result = await adapter(
      port(wikidataSearch),
      port(dbpediaSearch)
    ).ground({
      query,
      results: [],
      routeContext: route()
    })

    expect(wikidataSearch).toHaveBeenCalledTimes(2)
    expect(dbpediaSearch).toHaveBeenCalledTimes(1)
    expect(result.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'wikidata',
          status: 'succeeded',
          attempts: 2
        }),
        expect.objectContaining({
          provider: 'dbpedia',
          status: 'failed',
          failureClass: 'policy_violation',
          attempts: 1
        })
      ])
    )
  })

  it('enforces the aggregate provider-call budget before a retry can exceed it', async () => {
    const wikidataSearch = vi.fn(async () => {
      throw Object.assign(new Error('reset'), { code: 'ECONNRESET' })
    })
    const dbpediaSearch = vi.fn(async () => [dbpediaCandidate()])

    const constrained = createProductionEntityGroundingAdapter({
      executionId: 'execution_entity_00000001',
      wikidata: port(wikidataSearch),
      dbpedia: port(dbpediaSearch),
      limits: {
        maxMentions: 1,
        maxCandidatesPerProvider: 2,
        maxResolvedEntities: 2,
        maxCanonicalIdsPerOutcome: 2,
        maxProviderCalls: 2,
        maxConcurrency: 1,
        perProviderTimeoutMs: 1_000,
        maxAttemptsPerProvider: 3,
        baseRetryDelayMs: 0,
        maxRetryDelayMs: 0
      },
      random: () => 0,
      sleep: async () => undefined,
      now: () => new Date('2026-07-13T00:00:00.000Z')
    })

    const result = await constrained.ground({
      query,
      results: [],
      routeContext: route()
    })

    expect(wikidataSearch).toHaveBeenCalledTimes(2)
    expect(dbpediaSearch).not.toHaveBeenCalled()
    expect(result.budget).toEqual({
      providerCallsUsed: 2,
      providerCallsAllowed: 2
    })
    expect(result.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'dbpedia',
          status: 'failed',
          failureClass: 'policy_violation',
          attempts: 0,
          networkCallStarted: false,
          reasonCodes: ['provider_call_budget_exhausted']
        })
      ])
    )
  })

  it('fails closed on malformed or oversized provider output', async () => {
    const malformed = port(async () => [
      {
        label: '',
        matchedText: '',
        wikidataId: 'Q1',
        source: 'wikidata',
        confidence: 5
      }
    ])
    const oversized = port(async () => [
      dbpediaCandidate('One', 'https://dbpedia.org/resource/One'),
      dbpediaCandidate('Two', 'https://dbpedia.org/resource/Two'),
      dbpediaCandidate('Three', 'https://dbpedia.org/resource/Three')
    ])

    const result = await adapter(malformed, oversized).ground({
      query,
      results: [],
      routeContext: route()
    })

    expect(result.outcomes.every(outcome => outcome.status === 'failed')).toBe(
      true
    )
    expect(
      result.outcomes.every(
        outcome => outcome.failureClass === 'malformed_output'
      )
    ).toBe(true)
    expect(result.completed).toBe(false)
    expect(result.unresolvedMentionIds).toHaveLength(1)
  })

  it('preserves same-label canonical conflicts as ambiguity blockers', async () => {
    const wikidata = port(async () => [
      wikidataCandidate('Example Corp', 'Q123')
    ])
    const dbpedia = port(async () => [
      dbpediaCandidate(
        'Example Corp',
        'https://dbpedia.org/resource/Different_Example_Corp'
      )
    ])

    const result = await adapter(wikidata, dbpedia).ground({
      query,
      results: [],
      routeContext: route()
    })

    expect(result.resolvedEntities.some(entity => entity.ambiguous)).toBe(true)
    expect(result.ambiguousMentionIds).toHaveLength(1)
    expect(result.completed).toBe(false)
    expect(result.reasonCodes).toContain('required_entity_ambiguous')
  })

  it('propagates caller cancellation and prevents later provider work', async () => {
    const controller = new AbortController()
    const wikidataSearch = vi.fn(async () => {
      controller.abort(new Error('user cancelled grounding'))
      throw new Error('provider interrupted')
    })
    const dbpediaSearch = vi.fn(async () => [dbpediaCandidate()])

    await expect(
      adapter(port(wikidataSearch), port(dbpediaSearch), {
        limits: {
          maxMentions: 1,
          maxCandidatesPerProvider: 2,
          maxResolvedEntities: 2,
          maxCanonicalIdsPerOutcome: 2,
          maxProviderCalls: 4,
          maxConcurrency: 1,
          perProviderTimeoutMs: 1_000,
          maxAttemptsPerProvider: 2,
          baseRetryDelayMs: 0,
          maxRetryDelayMs: 0
        }
      }).ground({
        query,
        results: [],
        routeContext: route(),
        signal: controller.signal
      })
    ).rejects.toThrow('user cancelled grounding')

    expect(wikidataSearch).toHaveBeenCalledTimes(1)
    expect(dbpediaSearch).not.toHaveBeenCalled()
  })

  it('rejects hardcoded or unsafe runtime bounds at construction', () => {
    expect(() =>
      createProductionEntityGroundingAdapter({
        executionId: 'execution_entity_00000001',
        wikidata: port(async () => []),
        dbpedia: port(async () => []),
        limits: {
          maxMentions: 0,
          maxCandidatesPerProvider: 2,
          maxResolvedEntities: 2,
          maxCanonicalIdsPerOutcome: 2,
          maxProviderCalls: 4,
          maxConcurrency: 2,
          perProviderTimeoutMs: 1_000
        }
      })
    ).toThrow('Invalid entity grounding mention limit.')
  })
})
