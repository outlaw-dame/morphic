import { describe, expect, it } from 'vitest'

import { createDegradedSearchResult } from '../search/degraded'

describe('degraded search results', () => {
  it('returns a complete generic result without leaking provider errors', () => {
    const result = createDegradedSearchResult('latest world cup news')

    expect(result).toMatchObject({
      query: 'latest world cup news',
      degraded: true,
      images: [],
      results: [],
      number_of_results: 0
    })
    expect(result.warnings?.[0]).toContain('web search provider is unavailable')
    expect(result.warnings?.[0]).not.toMatch(/ECONNREFUSED|localhost|API_KEY/i)
  })
})
