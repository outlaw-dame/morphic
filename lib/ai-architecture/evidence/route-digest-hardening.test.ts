import { describe, expect, it } from 'vitest'

import {
  createRouteExecutionContext,
  digestRoutePlan,
  isCanonicalRouteDigest
} from '@/lib/ai/router/execution-context'
import { buildDeterministicRouteFloor } from '@/lib/ai/router/router-admission'
import type { SearchResultItem } from '@/lib/types'

import { buildEvidenceGraph } from './evidence-graph'
import { normalizeSearchResultToEvidenceDetailed } from './normalize-search-result'

const query = 'Research Example Corp ownership.'
const retrievedAt = '2026-07-12T20:00:00.000Z'

function routeContext() {
  const routePlan = buildDeterministicRouteFloor({ query })
  return createRouteExecutionContext({
    routePlan,
    routeDigest: digestRoutePlan(routePlan)
  })
}

function result(routeDigest: string): SearchResultItem {
  return {
    title: 'Example Corp filing',
    url: 'https://example.gov/filing',
    content: 'The filing identifies the current ownership of Example Corp.',
    retrievalProvenance: {
      routeDigest,
      pathId: 'official_filing',
      pathPurpose: 'primary_evidence',
      sourceClass: 'government_or_regulator',
      retrievedAt
    }
  }
}

describe('AI-I6 canonical route digest hardening', () => {
  it('shares the Router canonical digest validator', () => {
    const context = routeContext()

    expect(isCanonicalRouteDigest(context.routeDigest)).toBe(true)
    expect(isCanonicalRouteDigest('sha256:0123456789abcdef')).toBe(false)
    expect(isCanonicalRouteDigest('a'.repeat(63))).toBe(false)
    expect(isCanonicalRouteDigest('A'.repeat(64))).toBe(false)
  })

  it('rejects a non-canonical graph route digest before ingestion', () => {
    expect(() =>
      buildEvidenceGraph({
        query,
        results: [result('sha256:0123456789abcdef')],
        routeDigest: 'sha256:0123456789abcdef',
        requireRetrievalProvenance: true
      })
    ).toThrow('Invalid evidence graph route digest.')
  })

  it('rejects non-canonical provenance even without route comparison', () => {
    const outcome = normalizeSearchResultToEvidenceDetailed(
      result('sha256:0123456789abcdef'),
      0,
      { retrievedAt }
    )

    expect(outcome).toEqual({
      item: null,
      issue: 'invalid_retrieval_provenance'
    })
  })

  it('admits provenance bound to a canonical signed route digest', () => {
    const context = routeContext()
    const graph = buildEvidenceGraph({
      query,
      results: [result(context.routeDigest)],
      routeDigest: context.routeDigest,
      requireRetrievalProvenance: true
    })

    expect(graph.items).toHaveLength(1)
    expect(graph.ingestion).toMatchObject({
      admittedCount: 1,
      excludedCount: 0,
      routeDigest: context.routeDigest,
      requiredRetrievalProvenance: true
    })
  })
})
