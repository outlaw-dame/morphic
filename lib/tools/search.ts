import { cookies } from 'next/headers'

import { tool, type UIToolInvocation } from 'ai'

import { annotateSearchResultsWithEvidence } from '@/lib/agentic/evidence'
import { classifyOperationRequest } from '@/lib/agentic/router'
import {
  FEED_SUBSCRIPTIONS_COOKIE,
  type FeedSubscription,
  parseFeedSubscriptionsCookie
} from '@/lib/config/feed-subscriptions'
import { DEFAULT_SEARCH_PREFERENCES } from '@/lib/config/search-preferences'
import { getSearchSchemaForModel } from '@/lib/schema/search'
import type { SearchResultItem, SearchResults } from '@/lib/types'
import {
  getGeneralSearchProviderType,
  getSearchToolDescription,
  searchProviderSupportsContentTypes
} from '@/lib/utils/search-config'
import { getBaseUrlString } from '@/lib/utils/url'

import {
  mergeCommunityResults,
  searchCommunitySources,
  shouldSearchCommunitySources
} from './search/community'
import {
  createSearchProvider,
  DEFAULT_PROVIDER,
  type SearchProviderType
} from './search/providers'
import { searchUserFeeds } from './search/user-feeds'
import {
  mergeVideoResults,
  searchOwncastSources,
  shouldSearchOwncastSources
} from './search/video-sources'

/**
 * Creates a search tool with the appropriate schema for the given model.
 */
export function createSearchTool(fullModel: string) {
  return tool({
    description: getSearchToolDescription(),
    inputSchema: getSearchSchemaForModel(fullModel),
    async *execute(
      {
        query,
        type = 'optimized',
        content_types = ['web'],
        max_results = 20,
        search_depth = 'basic', // Default for standard schema
        include_domains = [],
        exclude_domains = []
      },
      context
    ) {
      // Yield initial searching state
      yield {
        state: 'searching' as const,
        query
      }
      // Ensure max_results is at least 10
      const minResults = 10
      const effectiveMaxResults = Math.max(
        max_results || minResults,
        minResults
      )
      const effectiveSearchDepth = search_depth as 'basic' | 'advanced'

      // Use the original query as is - any provider-specific handling will be done in the provider
      const filledQuery = query
      let searchResult: SearchResults

      // Determine which provider to use based on type
      let searchAPI: SearchProviderType
      if (type === 'general') {
        const configuredProvider =
          (process.env.SEARCH_API as SearchProviderType) || DEFAULT_PROVIDER

        if (
          searchProviderSupportsContentTypes(
            configuredProvider,
            content_types as Array<'web' | 'video' | 'image' | 'news'>
          )
        ) {
          searchAPI = configuredProvider
        } else {
          // Try to use a dedicated general search provider when the configured
          // provider cannot satisfy the requested media types.
          const generalProvider = getGeneralSearchProviderType(
            content_types as Array<'web' | 'video' | 'image' | 'news'>
          )
          if (generalProvider) {
            searchAPI = generalProvider
          } else {
            searchAPI = configuredProvider
            console.log(
              `[Search] type="general" requested but no configured provider fully supports content_types=${content_types.join(',')}; using ${searchAPI}`
            )
          }
        }
      } else {
        // For 'optimized', use the configured provider
        searchAPI =
          (process.env.SEARCH_API as SearchProviderType) || DEFAULT_PROVIDER
      }

      const effectiveSearchDepthForAPI =
        searchAPI === 'searxng' &&
        process.env.SEARXNG_DEFAULT_DEPTH === 'advanced'
          ? 'advanced'
          : effectiveSearchDepth || 'basic'

      console.log(
        `Using search API: ${searchAPI}, Type: ${type}, Search Depth: ${effectiveSearchDepthForAPI}`
      )

      const searchProvider = createSearchProvider(searchAPI)

      // Read user search preferences from cookies
      let userPrefs = { ...DEFAULT_SEARCH_PREFERENCES }
      let userFeedSubscriptions: FeedSubscription[] = []
      try {
        const cookieStore = await cookies()
        const raw = cookieStore.get('searchPreferences')?.value
        if (raw) {
          const parsed = JSON.parse(decodeURIComponent(raw))
          userPrefs = { ...userPrefs, ...parsed }
        }
        userFeedSubscriptions = parseFeedSubscriptionsCookie(
          cookieStore.get(FEED_SUBSCRIPTIONS_COOKIE)?.value
        )
      } catch {
        // Use defaults if cookies are unavailable
      }

      const searchPreferences = {
        language: userPrefs.language,
        region: userPrefs.region,
        safeSearch: userPrefs.safeSearch as 'off' | 'moderate' | 'strict'
      }

      try {
        if (
          searchAPI === 'searxng' &&
          effectiveSearchDepthForAPI === 'advanced'
        ) {
          // Get the base URL using the centralized utility function
          const baseUrl = await getBaseUrlString()

          const response = await fetch(`${baseUrl}/api/advanced-search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: filledQuery,
              maxResults: effectiveMaxResults,
              searchDepth: effectiveSearchDepthForAPI,
              includeDomains: include_domains,
              excludeDomains: exclude_domains,
              contentTypes: content_types
            })
          })
          if (!response.ok) {
            throw new Error(
              `Advanced search API error: ${response.status} ${response.statusText}`
            )
          }
          searchResult = await response.json()
        } else {
          searchResult = await searchProvider.search(
            filledQuery,
            effectiveMaxResults,
            effectiveSearchDepthForAPI,
            include_domains,
            exclude_domains,
            {
              type: type as 'general' | 'optimized',
              content_types: content_types as Array<
                'web' | 'video' | 'image' | 'news'
              >,
              preferences: searchPreferences
            }
          )
        }

        const searchContentTypes = content_types as Array<
          'web' | 'video' | 'image' | 'news'
        >
        const communityResults = shouldSearchCommunitySources({
          query: filledQuery,
          contentTypes: searchContentTypes,
          includeDomains: include_domains
        })
          ? await searchCommunitySources({
              provider: searchProvider,
              query: filledQuery,
              searchDepth: effectiveSearchDepthForAPI,
              excludeDomains: exclude_domains,
              maxResults: 4
            })
          : []

        searchResult = mergeCommunityResults(searchResult, communityResults)

        const owncastVideos = shouldSearchOwncastSources({
          query: filledQuery,
          contentTypes: searchContentTypes,
          includeDomains: include_domains
        })
          ? await searchOwncastSources({
              provider: searchProvider,
              query: filledQuery,
              searchDepth: effectiveSearchDepthForAPI,
              excludeDomains: exclude_domains,
              maxResults: 3
            })
          : []

        searchResult = mergeVideoResults(searchResult, owncastVideos)

        const userFeedResults = await searchUserFeeds({
          query: filledQuery,
          subscriptions: userFeedSubscriptions,
          maxResults: 6
        })

        if (userFeedResults.length) {
          searchResult = {
            ...searchResult,
            results: [...userFeedResults, ...(searchResult.results ?? [])],
            number_of_results:
              (searchResult.number_of_results ??
                searchResult.results?.length ??
                0) + userFeedResults.length
          }
        }
      } catch (error) {
        console.error('Search API error:', error)
        // Re-throw the error to let AI SDK handle it properly
        throw error instanceof Error ? error : new Error('Unknown search error')
      }

      // Add toolCallId from context before evidence/citation metadata is built.
      if (context?.toolCallId) {
        searchResult.toolCallId = context.toolCallId
      }

      searchResult = annotateSearchResultsWithEvidence(
        searchResult,
        classifyOperationRequest(filledQuery)
      )

      // Add citation mapping to search results
      if (searchResult.results && searchResult.results.length > 0) {
        const citationMap: Record<number, SearchResultItem> = {}
        searchResult.results.forEach((result, index) => {
          citationMap[index + 1] = result // Citation numbers start at 1
        })
        searchResult.citationMap = citationMap
      }

      console.log('completed search')

      // Yield final results with complete state
      yield {
        state: 'complete' as const,
        ...searchResult
      }
    }
  })
}

// Default export for backward compatibility, using a default model
export const searchTool = createSearchTool('openai:gpt-4o-mini')

// Export type for UI tool invocation
export type SearchUIToolInvocation = UIToolInvocation<typeof searchTool>

export async function search(
  query: string,
  maxResults: number = 10,
  searchDepth: 'basic' | 'advanced' = 'basic',
  includeDomains: string[] = [],
  excludeDomains: string[] = []
): Promise<SearchResults> {
  const result = await searchTool.execute?.(
    {
      query,
      type: 'general',
      content_types: ['web'],
      max_results: maxResults,
      search_depth: searchDepth,
      include_domains: includeDomains,
      exclude_domains: excludeDomains
    },
    {
      toolCallId: 'search',
      messages: []
    }
  )

  if (!result) {
    return { results: [], images: [], query, number_of_results: 0 }
  }

  // Handle AsyncIterable case
  if (Symbol.asyncIterator in result) {
    // Collect all results from the async iterable
    let searchResults: SearchResults | null = null
    for await (const chunk of result) {
      // Only assign when we get the complete result
      if ('state' in chunk && chunk.state === 'complete') {
        const { state, ...rest } = chunk
        searchResults = rest as SearchResults
      }
    }
    return (
      searchResults ?? { results: [], images: [], query, number_of_results: 0 }
    )
  }

  return result as SearchResults
}
