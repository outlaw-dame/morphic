import { describe, expect, it } from 'vitest'

import type { SearchResultItem } from '@/lib/types'

import { extractAtomicClaims } from './claim-extraction'
import { buildEvidenceGraph } from './evidence-graph'
import { canonicalizeEvidenceUrl } from './evidence-url'
import { normalizeSearchResultToEvidence } from './normalize-search-result'

const retrievedAt = '2026-07-05T12:00:00.000Z'

function result(overrides: Partial<SearchResultItem>): SearchResultItem {
  return {
    title: 'Example result',
    url: 'https://example.com/article',
    content:
      'Cape Verde is an island country in the central Atlantic Ocean. Praia is the capital of Cape Verde.',
    ...overrides
  }
}

describe('evidence graph normalization', () => {
  it('canonicalizes safe URLs and strips credentials, fragments, and default ports', () => {
    const canonical = canonicalizeEvidenceUrl(
      'https://user:password@Example.com:443/path/#section'
    )

    expect(canonical).toEqual({
      originalUrl: 'https://user:password@Example.com:443/path/#section',
      canonicalUrl: 'https://example.com/path',
      host: 'example.com'
    })
  })

  it('rejects unsupported URL schemes before evidence creation', () => {
    expect(canonicalizeEvidenceUrl('javascript:alert(1)')).toBeNull()
    expect(canonicalizeEvidenceUrl('file:///etc/passwd')).toBeNull()

    const evidence = normalizeSearchResultToEvidence(
      result({ url: 'javascript:alert(1)' }),
      0,
      { retrievedAt }
    )

    expect(evidence).toBeNull()
  })

  it('normalizes search results into schema-backed evidence with quality metadata', () => {
    const evidence = normalizeSearchResultToEvidence(
      result({
        url: 'https://www.reddit.com/r/travel/comments/example#top',
        title: 'Cape Verde trip report',
        publishedAt: '2026-07-01T00:00:00.000Z',
        retrievalMethod: 'search'
      }),
      0,
      { retrievedAt }
    )

    expect(evidence).not.toBeNull()
    expect(evidence?.url).toBe(
      'https://www.reddit.com/r/travel/comments/example'
    )
    expect(evidence?.sourceClass).toBe('forum_or_reddit')
    expect(evidence?.sourceQuality.influenceCap).toBe(0.28)
    expect(evidence?.confidence).toBeLessThanOrEqual(0.28)
    expect(evidence?.claimIds.length).toBeGreaterThan(0)
  })

  it('does not treat invalid publication dates as current dates', () => {
    const evidence = normalizeSearchResultToEvidence(
      result({ publishedAt: 'unknown' }),
      0,
      { retrievedAt }
    )

    expect(evidence).not.toBeNull()
    expect(evidence?.publishedAt).toBeNull()
    expect(evidence?.sourceQuality.freshnessScore).toBe(0.45)
  })

  it('returns null instead of throwing when schema validation fails', () => {
    const evidence = normalizeSearchResultToEvidence(
      result({ retrievalMethod: '' }),
      0,
      { retrievedAt }
    )

    expect(evidence).toBeNull()
  })

  it('extracts atomic claims deterministically from evidence summaries', () => {
    const claims = extractAtomicClaims(
      'Cape Verde is an island country in the central Atlantic Ocean. Praia is the capital of Cape Verde.'
    )

    expect(claims).toHaveLength(2)
    expect(claims[0].id).toMatch(/^cl_/)
    expect(claims[0].normalizedText).toContain('cape verde')
  })

  it('does not strip stop words from inside unicode-adjacent terms', () => {
    const claims = extractAtomicClaims(
      'Theé regional spelling should remain intact for unicode-aware claim clustering.'
    )

    expect(claims[0].normalizedText).toContain('theé')
  })

  it('deduplicates canonical URLs and avoids copied-content corroboration', () => {
    const graph = buildEvidenceGraph({
      query: 'Cape Verde capital',
      retrievedAt,
      results: [
        result({
          url: 'https://example.com/article#intro',
          content:
            'Praia is the capital of Cape Verde. Cape Verde is in the Atlantic Ocean.'
        }),
        result({
          url: 'https://example.com/article/',
          content:
            'Praia is the capital of Cape Verde. Cape Verde is in the Atlantic Ocean.'
        }),
        result({
          url: 'https://mirror.example.net/copied',
          content:
            'Praia is the capital of Cape Verde. Cape Verde is in the Atlantic Ocean.'
        })
      ]
    })

    expect(graph.items).toHaveLength(3)
    expect(graph.duplicateGroups).toHaveLength(1)
    expect(graph.duplicateGroups[0].evidenceIds).toHaveLength(2)
    expect(graph.items[1].duplicateOf).toBe(graph.items[0].id)
    expect(graph.items[2].copiedFrom).toBe(graph.items[0].id)
    expect(graph.claimClusters[0].independentHostCount).toBe(2)
  })

  it('does not mark short generic summaries as copied content', () => {
    const graph = buildEvidenceGraph({
      query: 'generic summaries',
      retrievedAt,
      results: [
        result({
          url: 'https://one.example.com/not-found',
          content: 'Not Found'
        }),
        result({
          url: 'https://two.example.com/not-found',
          content: 'Not Found'
        })
      ]
    })

    expect(graph.items).toHaveLength(2)
    expect(graph.items[1].copiedFrom).toBeUndefined()
  })

  it('keeps malformed result fields bounded and warns on skipped results', () => {
    const graph = buildEvidenceGraph({
      query: 'hostile inputs',
      retrievedAt,
      results: [
        result({
          title: undefined as unknown as string,
          url: 'https://safe.example.com/page',
          content: null as unknown as string
        }),
        result({ url: 'data:text/html,<script>bad</script>' })
      ]
    })

    expect(graph.items).toHaveLength(1)
    expect(graph.items[0].title).toBe('safe.example.com')
    expect(graph.items[0].summary).toBe('safe.example.com')
    expect(graph.warnings).toContain(
      'Some results were excluded because their URLs were invalid or unsupported.'
    )
  })
})
