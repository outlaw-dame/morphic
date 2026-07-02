import { describe, expect, it } from 'vitest'

import {
  createAdvancedSearchCacheKey,
  matchesDomain,
  safeParseInt
} from './route'

describe('safeParseInt', () => {
  it('falls back for empty or invalid numeric environment values', () => {
    expect(safeParseInt(undefined, 15_000)).toBe(15_000)
    expect(safeParseInt('', 15_000)).toBe(15_000)
    expect(safeParseInt('not-a-number', 15_000)).toBe(15_000)
  })

  it('returns parsed integer values when valid', () => {
    expect(safeParseInt('25000', 15_000)).toBe(25_000)
  })
})

describe('matchesDomain', () => {
  it('matches exact domains and subdomains only', () => {
    expect(matchesDomain('example.com', 'example.com')).toBe(true)
    expect(matchesDomain('news.example.com', 'example.com')).toBe(true)
    expect(matchesDomain('notexample.com', 'example.com')).toBe(false)
  })

  it('does not substring-match unrelated domains', () => {
    expect(matchesDomain('google.com', 'co')).toBe(false)
    expect(matchesDomain('company.example', 'co')).toBe(false)
  })
})

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
