import { describe, expect, it } from 'vitest'

import type { SearchResultItem } from '@/lib/types'

import { buildEvidenceGraph } from './evidence-graph'

const routeDigest = '0'.repeat(64)
const otherRouteDigest = 'f'.repeat(64)
const retrievedAt = '2026-07-12T18:00:00.000Z'

function result(
  url: string,
  overrides: Partial<SearchResultItem> = {}
): SearchResultItem {
  return {
    title: 'Evidence source',
    url,
    content: 'Example Corp changed ownership in 2026 according to this source.',
    publishedAt: '2026-07-11T12:00:00.000Z',
    ...overrides
  }
}

function provenance(
  overrides: Partial<NonNullable<SearchResultItem['retrievalProvenance']>> = {}
): NonNullable<SearchResultItem['retrievalProvenance']> {
  return {
    routeDigest,
    pathId: 'official_path',
    pathPurpose: 'primary_evidence',
    sourceClass: 'official_source',
    retrievedAt,
    ...overrides
  }
}

describe('AI-I6 route-bound evidence ingestion', () => {
  it('preserves path-level provenance and per-result retrieval time', () => {
    const graph = buildEvidenceGraph({
      query: 'Who owns Example Corp?',
      routeDigest,
      requireRetrievalProvenance: true,
      results: [
        result('https://example.com/ownership', {
          retrievalProvenance: provenance()
        })
      ]
    })

    expect(graph.items).toHaveLength(1)
    expect(graph.items[0]?.retrievedAt).toBe(retrievedAt)
    expect(graph.items[0]?.retrievalPath).toBe('official_path')
    expect(graph.items[0]?.retrievalProvenance).toEqual({
      routeDigest,
      pathId: 'official_path',
      pathPurpose: 'primary_evidence',
      plannedSourceClass: 'official_source',
      retrievedAt
    })
    expect(graph.ingestion).toEqual({
      inputCount: 1,
      admittedCount: 1,
      excludedCount: 0,
      routeDigest,
      requiredRetrievalProvenance: true,
      issues: []
    })
  })

  it('requires a route digest whenever provenance is mandatory', () => {
    expect(() =>
      buildEvidenceGraph({
        query: 'Who owns Example Corp?',
        requireRetrievalProvenance: true,
        results: [
          result('https://example.com/ownership', {
            retrievalProvenance: provenance()
          })
        ]
      })
    ).toThrow('Route digest is required for route-bound evidence ingestion.')
  })

  it('fails closed when Fusion evidence omits undefined or null provenance', () => {
    expect(() =>
      buildEvidenceGraph({
        query: 'Who owns Example Corp?',
        routeDigest,
        requireRetrievalProvenance: true,
        results: [result('https://example.com/ownership')]
      })
    ).toThrow(
      'Fusion evidence ingestion failed closed at result 0: missing_retrieval_provenance.'
    )

    const explicitNull = {
      ...result('https://example.com/null-provenance'),
      retrievalProvenance: null
    } as unknown as SearchResultItem
    expect(() =>
      buildEvidenceGraph({
        query: 'Who owns Example Corp?',
        routeDigest,
        requireRetrievalProvenance: true,
        results: [explicitNull]
      })
    ).toThrow(
      'Fusion evidence ingestion failed closed at result 0: missing_retrieval_provenance.'
    )
  })

  it('fails closed when evidence is bound to another route', () => {
    expect(() =>
      buildEvidenceGraph({
        query: 'Who owns Example Corp?',
        routeDigest,
        requireRetrievalProvenance: true,
        results: [
          result('https://example.com/ownership', {
            retrievalProvenance: provenance({
              routeDigest: otherRouteDigest
            })
          })
        ]
      })
    ).toThrow(
      'Fusion evidence ingestion failed closed at result 0: route_digest_mismatch.'
    )
  })

  it('records bounded exclusion reasons for non-Fusion ingestion', () => {
    const graph = buildEvidenceGraph({
      query: 'Background research',
      routeDigest,
      results: [
        result('javascript:alert(1)'),
        result('https://example.com/valid', {
          retrievalProvenance: provenance({ retrievedAt: 'not-a-date' })
        }),
        result('https://example.org/admitted')
      ],
      retrievedAt
    })

    expect(graph.items).toHaveLength(1)
    expect(graph.ingestion).toMatchObject({
      inputCount: 3,
      admittedCount: 1,
      excludedCount: 2
    })
    expect(graph.ingestion?.issues).toEqual([
      { resultIndex: 0, code: 'invalid_or_unsupported_url' },
      { resultIndex: 1, code: 'invalid_retrieval_provenance' }
    ])
  })

  it('contains hostile non-object result elements', () => {
    const graph = buildEvidenceGraph({
      query: 'Hostile result batch',
      results: [null, 'bad', result('https://example.org/admitted')] as unknown as SearchResultItem[],
      retrievedAt
    })

    expect(graph.items).toHaveLength(1)
    expect(graph.ingestion?.issues).toEqual([
      { resultIndex: 0, code: 'schema_validation_failed' },
      { resultIndex: 1, code: 'schema_validation_failed' }
    ])
  })

  it('does not trust planned source class as the classified source class', () => {
    const graph = buildEvidenceGraph({
      query: 'Community experience',
      routeDigest,
      requireRetrievalProvenance: true,
      results: [
        result('https://www.reddit.com/r/example/comments/one', {
          retrievalProvenance: provenance({
            sourceClass: 'official_source',
            pathPurpose: 'community_experience'
          })
        })
      ]
    })

    expect(graph.items[0]?.retrievalProvenance?.plannedSourceClass).toBe(
      'official_source'
    )
    expect(graph.items[0]?.sourceClass).toBe('forum_or_reddit')
  })
})
