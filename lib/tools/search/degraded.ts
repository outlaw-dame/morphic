import type { SearchResults } from '@/lib/types'

export function createDegradedSearchResult(query: string): SearchResults {
  return {
    query,
    images: [],
    results: [],
    number_of_results: 0,
    degraded: true,
    warnings: [
      'The configured web search provider is unavailable, so this response may rely on other available tools and saved sources.'
    ]
  }
}
