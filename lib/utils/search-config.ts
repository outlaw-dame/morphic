/**
 * Search provider configuration utilities
 * Provides environment-aware descriptions and guidance for search tools
 */

/**
 * Checks if a dedicated "general" search provider is available
 */
export function isGeneralSearchProviderAvailable(): boolean {
  return Boolean(
    process.env.BRAVE_SEARCH_API_KEY ||
      process.env.TAVILY_API_KEY ||
      process.env.FIRECRAWL_API_KEY ||
      process.env.SEARXNG_API_URL
  )
}

/**
 * Gets the name of the current general search provider
 */
export function getGeneralSearchProviderName(): string {
  if (process.env.BRAVE_SEARCH_API_KEY) {
    return 'Brave Search'
  }
  if (process.env.TAVILY_API_KEY) {
    return 'Tavily'
  }
  if (process.env.FIRECRAWL_API_KEY) {
    return 'Firecrawl'
  }
  if (process.env.SEARXNG_API_URL) {
    return 'SearXNG'
  }
  return 'primary provider'
}

/**
 * Checks if the general search provider supports multimedia content types
 */
export function supportsMultimediaContentTypes(): boolean {
  return Boolean(
    process.env.BRAVE_SEARCH_API_KEY ||
      process.env.TAVILY_API_KEY ||
      process.env.FIRECRAWL_API_KEY ||
      process.env.SEARXNG_API_URL
  )
}

export function searchProviderSupportsContentTypes(
  provider: string | undefined,
  contentTypes: Array<'web' | 'video' | 'image' | 'news'> = ['web']
): boolean {
  const requested = new Set(contentTypes)
  const wantsImages = requested.has('image')
  const wantsVideos = requested.has('video')
  const wantsNews = requested.has('news')

  switch (provider) {
    case 'brave':
      return Boolean(process.env.BRAVE_SEARCH_API_KEY)
    case 'tavily':
      return Boolean(process.env.TAVILY_API_KEY && !wantsVideos)
    case 'firecrawl':
      return Boolean(process.env.FIRECRAWL_API_KEY && !wantsVideos)
    case 'searxng':
    case 'qwant':
    case 'duckduckgo':
      return Boolean(process.env.SEARXNG_API_URL)
    case 'exa':
    case 'kagi':
      return !wantsImages && !wantsVideos && !wantsNews
    default:
      return !wantsImages && !wantsVideos && !wantsNews
  }
}

/**
 * Gets the appropriate search type description based on available providers
 */
export function getSearchTypeDescription(): string {
  const hasGeneralProvider = isGeneralSearchProviderAvailable()
  const providerName = getGeneralSearchProviderName()

  if (hasGeneralProvider) {
    return `Search type: general for ${providerName} or another configured multimedia-capable provider (supports image/video content_types when that provider exposes them), optimized for AI-focused providers with content snippets (Tavily/Exa/SearXNG)`
  } else {
    return 'Search type: general and optimized both use the primary AI-focused provider (Tavily/Exa/SearXNG) with content snippets. Note: video/image content_types require a dedicated general search provider (not configured)'
  }
}

/**
 * Gets the tool description based on available providers
 */
export function getSearchToolDescription(): string {
  const supportsMultimedia = supportsMultimediaContentTypes()

  if (supportsMultimedia) {
    return 'Search the web for information. For video/image content, use type="general" with content_types:["video"] or content_types:["image"] when a multimedia-capable provider is configured.'
  } else {
    return 'Search the web for information using AI-focused providers. Note: Video/image searches with content_types require a dedicated general search provider (not configured). Use type="optimized" for best results with available providers.'
  }
}

/**
 * Gets content types guidance for agent prompts
 */
export function getContentTypesGuidance(): string {
  const hasGeneralProvider = isGeneralSearchProviderAvailable()
  const providerName = getGeneralSearchProviderName()
  const supportsMultimedia = supportsMultimediaContentTypes()

  if (hasGeneralProvider && supportsMultimedia) {
    return `- **type="general" (for time-sensitive or specific content):**
  - Uses ${providerName} or another configured provider for enhanced multimedia support
  - Returns search results without deep content extraction
  - Best for:
    - Today's news, current events, recent updates
    - Videos: content_types: ['video'] or ['web', 'video']
    - Images: content_types: ['image'] or ['web', 'image']
    - When you need the LATEST information where recency matters
  - Pattern: type="general" search → identify sources → fetch for content`
  } else {
    return `- **type="general" and type="optimized":**
  - Both use the primary AI-focused provider (Tavily/Exa/SearXNG)
  - Returns search results with content snippets
  - Note: Video/image content_types are not supported (requires dedicated general search provider)
  - Best for: Research questions, fact-finding, explanatory queries
  - Use type="optimized" for consistent behavior`
  }
}

/**
 * Gets the search strategy guidance for planning mode
 */
export function getSearchStrategyGuidance(): string {
  const hasGeneralProvider = isGeneralSearchProviderAvailable()
  const supportsMultimedia = supportsMultimediaContentTypes()

  if (hasGeneralProvider && supportsMultimedia) {
    return `Search strategy:
- Use type="optimized" for most research queries (provides content snippets)
- Use type="general" for time-sensitive info, videos, or images (requires fetch)
- ALWAYS follow type="general" searches with fetch tool for content
- For comprehensive research: multiple searches + selective fetching`
  } else {
    return `Search strategy:
- Use type="optimized" for all queries (provides content snippets from primary provider)
- type="general" will behave the same as "optimized" (dedicated general search provider not available)
- Fetch tool can be used optionally for deeper content analysis
- For comprehensive research: multiple searches + selective fetching`
  }
}

/**
 * Gets the appropriate fallback search provider type for "general" searches.
 */
export function getGeneralSearchProviderType(
  contentTypes: Array<'web' | 'video' | 'image' | 'news'> = ['web']
): 'brave' | 'tavily' | 'firecrawl' | 'searxng' | null {
  if (searchProviderSupportsContentTypes('brave', contentTypes)) {
    return 'brave'
  }
  if (searchProviderSupportsContentTypes('tavily', contentTypes)) {
    return 'tavily'
  }
  if (searchProviderSupportsContentTypes('firecrawl', contentTypes)) {
    return 'firecrawl'
  }
  if (searchProviderSupportsContentTypes('searxng', contentTypes)) {
    return 'searxng'
  }
  return null
}
