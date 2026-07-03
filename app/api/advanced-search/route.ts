import { NextResponse } from 'next/server'

import { Redis } from '@upstash/redis'
import { createClient } from 'redis'

import {
  buildAdvancedSearchCacheKey,
  calculateRelevanceScore,
  crawlPage,
  domainMatchesFilter,
  isQualityContent,
  mapWithConcurrency,
  parseAdvancedSearchRequest,
  type SearchDepth
} from '@/lib/tools/search/advanced-search'
import type {
  SearchResultItem,
  SearXNGResponse,
  SearXNGResult,
  SearXNGSearchResults
} from '@/lib/types'
import { readResponseWithLimit } from '@/lib/utils/ssrf-guard'

/**
 * Maximum number of results to fetch from SearXNG.
 * Increasing this value can improve result quality but may impact performance.
 * In advanced search mode, this is multiplied by SEARXNG_CRAWL_MULTIPLIER for initial fetching.
 */
const SEARXNG_MAX_RESULTS = Math.max(
  10,
  Math.min(100, parseInt(process.env.SEARXNG_MAX_RESULTS || '50', 10))
)

const CACHE_TTL = 3600 // Cache time-to-live in seconds (1 hour)
const SEARXNG_RESPONSE_MAX_BYTES = parseInt(
  process.env.SEARXNG_RESPONSE_MAX_BYTES || '2097152',
  10
)
const CRAWL_RESPONSE_MAX_BYTES = parseInt(
  process.env.ADVANCED_SEARCH_CRAWL_MAX_BYTES || '1048576',
  10
)
const CRAWL_MAX_REDIRECTS = parseInt(
  process.env.ADVANCED_SEARCH_CRAWL_MAX_REDIRECTS || '3',
  10
)
const CRAWL_CONCURRENCY = Math.max(
  1,
  Math.min(
    10,
    parseInt(process.env.ADVANCED_SEARCH_CRAWL_CONCURRENCY || '5', 10)
  )
)

let redisClient: Redis | ReturnType<typeof createClient> | null = null

// Initialize Redis client based on environment variables
async function initializeRedisClient() {
  if (redisClient) return redisClient

  const upstashRedisRestUrl = process.env.UPSTASH_REDIS_REST_URL
  const upstashRedisRestToken = process.env.UPSTASH_REDIS_REST_TOKEN

  // Use Upstash Redis if credentials are provided
  if (upstashRedisRestUrl && upstashRedisRestToken) {
    redisClient = new Redis({
      url: upstashRedisRestUrl,
      token: upstashRedisRestToken
    })
    return redisClient
  }

  // Otherwise, try to use local Redis (for Docker/SearXNG usage)
  try {
    const localRedisUrl =
      process.env.LOCAL_REDIS_URL || 'redis://localhost:6379'
    const client = createClient({ url: localRedisUrl })
    await client.connect()
    redisClient = client
  } catch (error) {
    console.warn(
      'Failed to connect to local Redis. Advanced search caching disabled.',
      error
    )
    redisClient = null
  }

  return redisClient
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

// Function to get cached results
async function getCachedResults(
  cacheKey: string
): Promise<SearXNGSearchResults | null> {
  try {
    const client = await initializeRedisClient()
    if (!client) return null

    let cachedData: string | null
    if (client instanceof Redis) {
      cachedData = await client.get(cacheKey)
    } else {
      cachedData = await client.get(cacheKey)
    }

    if (cachedData) {
      console.log(`Cache hit for key: ${cacheKey}`)
      return JSON.parse(cachedData)
    } else {
      console.log(`Cache miss for key: ${cacheKey}`)
      return null
    }
  } catch (error) {
    console.error('Redis cache error:', error)
    return null
  }
}

// Function to set cached results with error handling and logging
async function setCachedResults(
  cacheKey: string,
  results: SearXNGSearchResults
): Promise<void> {
  try {
    const client = await initializeRedisClient()
    if (!client) return

    const serializedResults = JSON.stringify(results)
    if (client instanceof Redis) {
      await client.set(cacheKey, serializedResults, { ex: CACHE_TTL })
    } else {
      await client.set(cacheKey, serializedResults, { EX: CACHE_TTL })
    }
    console.log(`Cached results for key: ${cacheKey}`)
  } catch (error) {
    console.error('Redis cache error:', error)
  }
}

export async function POST(request: Request) {
  let query = ''

  try {
    const parsedRequest = parseAdvancedSearchRequest(
      await request.json(),
      SEARXNG_MAX_RESULTS
    )
    if (!parsedRequest) {
      return NextResponse.json(
        {
          message: 'Query is required',
          results: [],
          images: [],
          number_of_results: 0
        },
        { status: 400 }
      )
    }

    query = parsedRequest.query
    const { maxResults, searchDepth, includeDomains, excludeDomains } =
      parsedRequest

    const cacheKey = buildAdvancedSearchCacheKey({
      query,
      maxResults,
      searchDepth,
      includeDomains,
      excludeDomains
    })

    // Try to get cached results
    const cachedResults = await getCachedResults(cacheKey)
    if (cachedResults) {
      return NextResponse.json(cachedResults)
    }

    // If not cached, perform the search
    const results = await advancedSearchXNGSearch(
      query,
      maxResults,
      searchDepth,
      includeDomains,
      excludeDomains
    )

    // Cache the results
    await setCachedResults(cacheKey, results)

    return NextResponse.json(results)
  } catch (error) {
    console.error('Advanced search error:', error)
    return NextResponse.json(
      {
        message: 'Internal Server Error',
        error: sanitizeError(error),
        query,
        results: [],
        images: [],
        number_of_results: 0
      },
      { status: 500 }
    )
  }
}

async function advancedSearchXNGSearch(
  query: string,
  maxResults: number = 10,
  searchDepth: SearchDepth = 'advanced',
  includeDomains: string[] = [],
  excludeDomains: string[] = []
): Promise<SearXNGSearchResults> {
  const apiUrl = process.env.SEARXNG_API_URL
  if (!apiUrl) {
    throw new Error('SEARXNG_API_URL is not set in the environment variables')
  }

  const SEARXNG_ENGINES =
    process.env.SEARXNG_ENGINES || 'google,bing,duckduckgo,wikipedia'
  const SEARXNG_TIME_RANGE = process.env.SEARXNG_TIME_RANGE || 'None'
  const SEARXNG_SAFESEARCH = process.env.SEARXNG_SAFESEARCH || '0'
  const SEARXNG_CRAWL_MULTIPLIER = parseInt(
    process.env.SEARXNG_CRAWL_MULTIPLIER || '4',
    10
  )

  try {
    const url = new URL(`${apiUrl}/search`)
    url.searchParams.append('q', query)
    url.searchParams.append('format', 'json')
    url.searchParams.append('categories', 'general,images')

    // Add time_range if it's not 'None'
    if (SEARXNG_TIME_RANGE !== 'None') {
      url.searchParams.append('time_range', SEARXNG_TIME_RANGE)
    }

    url.searchParams.append('safesearch', SEARXNG_SAFESEARCH)
    url.searchParams.append('engines', SEARXNG_ENGINES)

    const resultsPerPage = 10
    const pageno = Math.ceil(maxResults / resultsPerPage)
    url.searchParams.append('pageno', String(pageno))

    const data:
      | SearXNGResponse
      | { error: string; status: number; data: string } =
      await fetchJsonWithRetry(url.toString(), 3)

    if ('error' in data) {
      console.error('Invalid response from SearXNG:', data)
      throw new Error(
        `Invalid response from SearXNG: ${data.error}. Status: ${data.status}. Data: ${data.data}`
      )
    }

    if (!data || !Array.isArray(data.results)) {
      console.error('Invalid response structure from SearXNG:', data)
      throw new Error('Invalid response structure from SearXNG')
    }

    let generalResults = data.results.filter(
      (result: SearXNGResult) => result && !result.img_src
    )

    // Apply domain filtering manually
    if (includeDomains.length > 0 || excludeDomains.length > 0) {
      generalResults = generalResults.filter(result =>
        domainMatchesFilter(result.url, includeDomains, excludeDomains)
      )
    }

    if (searchDepth === 'advanced') {
      const crawledResults = await mapWithConcurrency(
        generalResults.slice(0, maxResults * SEARXNG_CRAWL_MULTIPLIER),
        CRAWL_CONCURRENCY,
        result =>
          crawlPage(result, query, {
            timeoutMs: 20000,
            maxRedirects: CRAWL_MAX_REDIRECTS,
            maxResponseBytes: CRAWL_RESPONSE_MAX_BYTES
          })
      )
      generalResults = crawledResults
        .filter(result => result !== null && isQualityContent(result.content))
        .map(result => result as SearXNGResult)

      const MIN_RELEVANCE_SCORE = 10
      generalResults = generalResults
        .map(result => ({
          ...result,
          score: calculateRelevanceScore(result, query)
        }))
        .filter(result => result.score >= MIN_RELEVANCE_SCORE)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults)
    }

    generalResults = generalResults.slice(0, maxResults)

    const imageResults = (data.results || [])
      .filter((result: SearXNGResult) => result && result.img_src)
      .slice(0, maxResults)

    return {
      results: generalResults.map(
        (result: SearXNGResult): SearchResultItem => ({
          title: result.title || '',
          url: result.url || '',
          content: result.content || ''
        })
      ),
      query: data.query || query,
      images: imageResults
        .map((result: SearXNGResult) => {
          const imgSrc = result.img_src || ''
          return imgSrc.startsWith('http') ? imgSrc : `${apiUrl}${imgSrc}`
        })
        .filter(Boolean),
      number_of_results: data.number_of_results || generalResults.length
    }
  } catch (error) {
    console.error('SearchXNG API error:', error)
    return {
      results: [],
      query: query,
      images: [],
      number_of_results: 0
    }
  }
}

async function fetchJsonWithRetry(url: string, retries: number): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchJson(url)
    } catch (error) {
      if (i === retries - 1) throw error
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
    }
  }
}

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json'
      },
      signal: controller.signal
    })
    const data = await readResponseWithLimit(response, SEARXNG_RESPONSE_MAX_BYTES)

    // Check if the response is JSON
    if (response.headers.get('content-type')?.includes('application/json')) {
      return JSON.parse(data)
    }

    // If not JSON, return an object with the raw data and status
    return {
      error: 'Invalid JSON response',
      status: response.status,
      data: data.substring(0, 200)
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
