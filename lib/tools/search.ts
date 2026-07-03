import { cookies } from 'next/headers'

import { tool, UIToolInvocation } from 'ai'

import {
  listSourcePreferenceProfiles,
  listSourcePreferences
} from '@/lib/actions/source-preferences'
import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { DEFAULT_SEARCH_PREFERENCES } from '@/lib/config/search-preferences'
import { enrichSearchResultsWithKnowledgeGraph } from '@/lib/entities/knowledge-graph'
import { getSearchSchemaForModel } from '@/lib/schema/search'
import { getEffectiveSourcePreferencesForQuery } from '@/lib/sources/source-preference-profiles'
import { applySourcePreferencesToSearchResults } from '@/lib/sources/source-preferences'
import { applySourceQualityToSearchResults } from '@/lib/sources/source-quality'
import { SearchResultItem, SearchResults } from '@/lib/types'
import {
  getGeneralSearchProviderType,
  getSearchToolDescription
} from '@/lib/utils/search-config'
import { getBaseUrlString } from '@/lib/utils/url'

import { createDegradedSearchResult } from './search/degraded'
import { blendConfiguredFeedResults } from './search/feed-blending'
import { getSearchProviderFallbackPlan } from './search/provider-fallbacks'
import {
  createSearchProvider,
  DEFAULT_PROVIDER,
  SearchProviderType
} from './search/providers'
import { isPublicSearXNGEnabled } from './search/providers/searxng-public-instances'

const SEARCH_PROVIDER_CONFIG: Record<
  SearchProviderType,
  { env?: string; searxngBacked?: boolean }
> = {
  qwant: { env: 'SEARXNG_API_URL', searxngBacked: true },
  duckduckgo: {},
  searxng: { env: 'SEARXNG_API_URL', searxngBacked: true },
  tavily: { env: 'TAVILY_API_KEY' },
  brave: { env: 'BRAVE_SEARCH_API_KEY' },
  kagi: { env: 'KAGI_SEARCH_API_KEY' },
  exa: { env: 'EXA_API_KEY' },
  firecrawl: { env: 'FIRECRAWL_API_KEY' }
}

const SEARCH_FALLBACK_ORDER: SearchProviderType[] = [
  'tavily',
  'duckduckgo',
  'brave',
  'kagi',
  'exa',
  'firecrawl',
  'searxng'
]

function isSearchProviderConfigured(provider: SearchProviderType): boolean {
  if (SEARCH_PROVIDER_CONFIG[provider].searxngBacked) {
    return Boolean(process.env.SEARXNG_API_URL) || isPublicSearXNGEnabled()
  }

  const envName = SEARCH_PROVIDER_CONFIG[provider].env
  return envName ? Boolean(process.env[envName]) : true
}

function shouldSkipFallbackProvider(
  provider: SearchProviderType,
  failedProvider: SearchProviderType
): boolean {
  if (provider === failedProvider) {
    return true
  }

  const failedConfig = SEARCH_PROVIDER_CONFIG[failedProvider]
  const fallbackConfig = SEARCH_PROVIDER_CONFIG[provider]

  return Boolean(failedConfig.searxngBacked && fallbackConfig.searxngBacked)
}

function getConfiguredSearchProvider(
  requestedProvider: SearchProviderType
): SearchProviderType {
  if (isSearchProviderConfigured(requestedProvider)) {
    return requestedProvider
  }

  const fallbackProvider = SEARCH_FALLBACK_ORDER.find(
    provider =>
      provider !== requestedProvider && isSearchProviderConfigured(provider)
  )

  if (fallbackProvider) {
    console.warn(
      `[Search] ${requestedProvider} is not configured; using ${fallbackProvider}.`
    )
    return fallbackProvider
  }

  return requestedProvider
}

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
      let searchResult: SearchResults | null = null

      // Determine which provider to use based on type
      let searchAPI: SearchProviderType
      if (type === 'general') {
        // Try to use dedicated general search provider
        const generalProvider = getGeneralSearchProviderType()
        if (generalProvider) {
          searchAPI = generalProvider
        } else {
          // Fallback to primary provider (optimized search provider)
          searchAPI =
            (process.env.SEARCH_API as SearchProviderType) || DEFAULT_PROVIDER
          console.log(
            `[Search] type="general" requested but no dedicated provider available, using optimized search provider: ${searchAPI}`
          )
        }
      } else {
        // For 'optimized', use the configured provider
        searchAPI =
          (process.env.SEARCH_API as SearchProviderType) || DEFAULT_PROVIDER
      }

      searchAPI = getConfiguredSearchProvider(searchAPI)

      const effectiveSearchDepthForAPI =
        searchAPI === 'searxng' &&
        process.env.SEARXNG_DEFAULT_DEPTH === 'advanced'
          ? 'advanced'
          : effectiveSearchDepth || 'basic'

      console.log(
        `Using search API: ${searchAPI}, Type: ${type}, Search Depth: ${effectiveSearchDepthForAPI}`
      )

      // Read user search preferences from cookies
      let userPrefs = { ...DEFAULT_SEARCH_PREFERENCES }
      try {
        const cookieStore = await cookies()
        const raw = cookieStore.get('searchPreferences')?.value
        if (raw) {
          const parsed = JSON.parse(decodeURIComponent(raw))
          userPrefs = { ...userPrefs, ...parsed }
        }
      } catch {
        // Use defaults if cookies are unavailable
      }

      const searchPreferences = {
        language: userPrefs.language,
        region: userPrefs.region,
        safeSearch: userPrefs.safeSearch as 'off' | 'moderate' | 'strict'
      }

      const runProviderSearch = async (
        providerType: SearchProviderType
      ): Promise<SearchResults> => {
        if (
          providerType === 'searxng' &&
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
              excludeDomains: exclude_domains
            })
          })
          if (!response.ok) {
            throw new Error(
              `Advanced search API error: ${response.status} ${response.statusText}`
            )
          }
          return response.json()
        }

        // Use the provider factory to get the appropriate search provider
        const searchProvider = createSearchProvider(providerType)

        // Pass content_types only for Brave provider
        if (providerType === 'brave') {
          return searchProvider.search(
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

        return searchProvider.search(
          filledQuery,
          effectiveMaxResults,
          effectiveSearchDepthForAPI,
          include_domains,
          exclude_domains,
          {
            preferences: searchPreferences
          }
        )
      }

      try {
        searchResult = await runProviderSearch(searchAPI)
      } catch (error) {
        const fallbackProviders = [
          ...getSearchProviderFallbackPlan(searchAPI),
          ...SEARCH_FALLBACK_ORDER
        ].filter((provider, index, providers) => {
          return (
            providers.indexOf(provider) === index &&
            !shouldSkipFallbackProvider(provider, searchAPI) &&
            isSearchProviderConfigured(provider)
          )
        })
        console.error('Search API error:', error)

        for (const fallbackProvider of fallbackProviders) {
          try {
            console.warn(
              `[Search] Falling back from ${searchAPI} to ${fallbackProvider}.`
            )
            searchResult = await runProviderSearch(fallbackProvider)
            searchAPI = fallbackProvider
            break
          } catch (fallbackError) {
            console.warn(
              `[Search] fallback provider ${fallbackProvider} failed:`,
              fallbackError
            )
          }
        }

        if (!searchResult) {
          searchResult = createDegradedSearchResult(filledQuery)
        }
      }

      searchResult = await blendConfiguredFeedResults(searchResult, {
        query: filledQuery,
        contentTypes: content_types as Array<'web' | 'video' | 'image' | 'news'>
      })

      if (searchResult.results.length > 0) {
        const rankedResults = applySourceQualityToSearchResults(
          searchResult.results,
          filledQuery
        )
        searchResult = {
          ...searchResult,
          results: rankedResults,
          number_of_results: rankedResults.length
        }
      }

      try {
        const userId = await getCurrentUserId()
        if (userId) {
          const preferenceResult = await listSourcePreferences(userId)
          if (
            preferenceResult.success &&
            preferenceResult.preferences.length > 0
          ) {
            const profileResult = await listSourcePreferenceProfiles(userId)
            const effectivePreferences = getEffectiveSourcePreferencesForQuery(
              preferenceResult.preferences,
              profileResult.success ? profileResult.profiles : [],
              filledQuery
            )
            const rankedResults = applySourcePreferencesToSearchResults(
              searchResult.results,
              effectivePreferences
            )
            searchResult = {
              ...searchResult,
              results: rankedResults,
              number_of_results: rankedResults.length
            }
          }
        }
      } catch (error) {
        console.warn(
          '[Search] Source preferences unavailable; continuing without personalization.',
          error
        )
      }

      searchResult = await enrichSearchResultsWithKnowledgeGraph(searchResult)

      // Add citation mapping and toolCallId to search results
      if (searchResult.results && searchResult.results.length > 0) {
        const citationMap: Record<number, SearchResultItem> = {}
        searchResult.results.forEach((result, index) => {
          citationMap[index + 1] = result // Citation numbers start at 1
        })
        searchResult.citationMap = citationMap
      }

      // Add toolCallId from context
      if (context?.toolCallId) {
        searchResult.toolCallId = context.toolCallId
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
