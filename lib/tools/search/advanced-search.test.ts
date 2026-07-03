import { describe, expect, it } from 'vitest'

import {
  buildAdvancedSearchCacheKey,
  calculateRelevanceScore,
  domainMatchesFilter,
  extractContentFromHtml,
  isQualityContent,
  mapWithConcurrency,
  parseAdvancedSearchRequest,
  parseMaxResults,
  parseSearchDepth,
  toStringArray
} from './advanced-search'

describe('advanced search request parsing', () => {
  it('rejects missing or blank queries', () => {
    expect(parseAdvancedSearchRequest({}, 50)).toBeNull()
    expect(parseAdvancedSearchRequest({ query: '   ' }, 50)).toBeNull()
  })

  it('trims queries, clamps max results, and filters domain arrays', () => {
    expect(
      parseAdvancedSearchRequest(
        {
          query: '  safety research  ',
          maxResults: 500,
          searchDepth: 'advanced',
          includeDomains: ['example.com', 42, null],
          excludeDomains: ['spam.test', false]
        },
        50
      )
    ).toEqual({
      query: 'safety research',
      maxResults: 50,
      searchDepth: 'advanced',
      includeDomains: ['example.com'],
      excludeDomains: ['spam.test']
    })
  })

  it('defaults invalid depth and result inputs safely', () => {
    expect(parseSearchDepth('deep', 'basic')).toBe('basic')
    expect(parseSearchDepth('deep', 'advanced')).toBe('advanced')
    expect(parseMaxResults('not-a-number', 100)).toBe(10)
    expect(parseMaxResults(-10, 100)).toBe(1)
    expect(parseMaxResults(250, 100)).toBe(100)
    expect(toStringArray(['ok', 1, 'also-ok'])).toEqual(['ok', 'also-ok'])
  })
})

describe('advanced search cache keys', () => {
  it('hashes raw query/domain values and is stable across domain order', () => {
    const first = buildAdvancedSearchCacheKey({
      query: 'private query',
      maxResults: 10,
      searchDepth: 'advanced',
      includeDomains: ['b.example', 'a.example'],
      excludeDomains: ['z.example', 'y.example']
    })
    const second = buildAdvancedSearchCacheKey({
      query: 'private query',
      maxResults: 10,
      searchDepth: 'advanced',
      includeDomains: ['a.example', 'b.example'],
      excludeDomains: ['y.example', 'z.example']
    })

    expect(first).toBe(second)
    expect(first).toMatch(/^search:[a-f0-9]{64}$/)
    expect(first).not.toContain('private query')
    expect(first).not.toContain('example')
  })
})

describe('advanced search filtering and content extraction', () => {
  it('applies include and exclude domain filters defensively', () => {
    expect(
      domainMatchesFilter('https://docs.example.com/page', ['example.com'], [])
    ).toBe(true)
    expect(
      domainMatchesFilter('https://docs.example.com/page', [], ['example.com'])
    ).toBe(false)
    expect(domainMatchesFilter('not a url', [], [])).toBe(false)
  })

  it('extracts static HTML content without external resources', () => {
    const extracted = extractContentFromHtml(
      `<!doctype html>
      <html>
        <head>
          <meta name="description" content="Reliable description">
          <meta property="article:published_time" content="2026-01-02T00:00:00Z">
          <script>globalThis.__shouldNotRun = true</script>
        </head>
        <body>
          <nav>navigation</nav>
          <main>
            <h1>Safety Research</h1>
            <p>This paragraph discusses advanced search safety and reliable retrieval.</p>
            <p>Another paragraph adds enough context for extraction and relevance.</p>
          </main>
        </body>
      </html>`,
      {
        title: 'Safety Research',
        url: 'https://example.com/safety',
        content: ''
      },
      'search safety'
    )

    expect(extracted.content).toContain('Reliable description')
    expect(extracted.content).toContain('<mark>search</mark>')
    expect(extracted.content).toContain('<mark>safety</mark>')
    expect(extracted.content).not.toContain('navigation')
    expect(extracted.publishedDate).toBe('2026-01-02T00:00:00.000Z')
  })

  it('scores relevant, recent, well-sized content higher than weak content', () => {
    const now = new Date('2026-02-01T00:00:00Z')
    const strongScore = calculateRelevanceScore(
      {
        title: 'Advanced Search Safety',
        publishedDate: '2026-01-20T00:00:00Z',
        content: `${'advanced search safety '.repeat(80)}<mark>advanced</mark>`
      },
      'advanced search safety',
      now
    )
    const weakScore = calculateRelevanceScore(
      {
        title: 'Unrelated',
        content: 'short',
        publishedDate: '2020-01-01T00:00:00Z'
      },
      'advanced search safety',
      now
    )

    expect(strongScore).toBeGreaterThan(weakScore)
    expect(isQualityContent('Content unavailable due to crawling error.')).toBe(
      false
    )
  })
})

describe('advanced search concurrency limiter', () => {
  it('preserves result order and caps concurrent work', async () => {
    let active = 0
    let maxActive = 0

    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async value => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setTimeout(resolve, 1))
      active -= 1
      return value * 2
    })

    expect(results).toEqual([2, 4, 6, 8, 10])
    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('returns an empty array without spawning workers for empty inputs', async () => {
    await expect(mapWithConcurrency([], 3, async value => value)).resolves.toEqual(
      []
    )
  })
})
