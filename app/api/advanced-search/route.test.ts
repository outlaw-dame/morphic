import { describe, expect, it } from 'vitest'

import { createAdvancedSearchCacheKey } from './route'

describe('createAdvancedSearchCacheKey', () => {
  it('does not include raw query or domain values in the cache key', () => {
    const key = createAdvancedSearchCacheKey({
      query: 'private search about sensitive topic',
      maxResults: 20,
      searchDepth: 'advanced',
      includeDomains: ['example.com'],
      excludeDomains: ['blocked.example']
    })

    expect(key).toMatch(/^search:[a-f0-9]{64}$/)
    expect(key).not.toContain('private search')
    expect(key).not.toContain('example.com')
    expect(key).not.toContain('blocked.example')
  })

  it('is stable regardless of domain filter order', () => {
    const left = createAdvancedSearchCacheKey({
      query: 'morphic ai architecture',
      maxResults: 10,
      searchDepth: 'basic',
      includeDomains: ['b.example', 'a.example'],
      excludeDomains: ['d.example', 'c.example']
    })

    const right = createAdvancedSearchCacheKey({
      query: 'morphic ai architecture',
      maxResults: 10,
      searchDepth: 'basic',
      includeDomains: ['a.example', 'b.example'],
      excludeDomains: ['c.example', 'd.example']
    })

    expect(left).toBe(right)
  })
})
