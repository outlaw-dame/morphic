import {
  buildCommunitySearchQuery,
  tagCommunityResult
} from '@/lib/config/community-sources'
import type { SearchResultItem, SearchResults } from '@/lib/types'

import type { SearchProvider } from './providers'

export function shouldSearchCommunitySources({
  query,
  contentTypes,
  includeDomains
}: {
  query: string
  contentTypes: Array<'web' | 'video' | 'image' | 'news'>
  includeDomains: string[]
}) {
  if (process.env.ENABLE_COMMUNITY_SEARCH === 'false') return false
  if (!query.trim()) return false
  if (includeDomains.length > 0) return false
  return contentTypes.includes('web')
}

export async function searchCommunitySources({
  provider,
  query,
  searchDepth,
  excludeDomains,
  maxResults = 4
}: {
  provider: SearchProvider
  query: string
  searchDepth: 'basic' | 'advanced'
  excludeDomains: string[]
  maxResults?: number
}): Promise<SearchResultItem[]> {
  const communityQuery = buildCommunitySearchQuery(query)

  try {
    const results = await provider.search(
      communityQuery,
      maxResults,
      searchDepth,
      [],
      excludeDomains,
      {
        type: 'general',
        content_types: ['web']
      }
    )

    return (results.results ?? [])
      .filter(result => result.url && result.title)
      .map(tagCommunityResult)
      .slice(0, maxResults)
  } catch (error) {
    console.warn('[CommunitySearch] Search failed:', error)
    return []
  }
}

export function mergeCommunityResults(
  searchResult: SearchResults,
  communityResults: SearchResultItem[]
): SearchResults {
  if (communityResults.length === 0) return searchResult

  const seen = new Set<string>()
  const mergedResults = [
    ...communityResults,
    ...(searchResult.results ?? [])
  ].filter(result => {
    const key = result.url.trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })

  return {
    ...searchResult,
    results: mergedResults,
    number_of_results: mergedResults.length
  }
}
