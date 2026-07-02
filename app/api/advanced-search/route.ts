import { createHash } from 'node:crypto'

import { Redis } from '@upstash/redis'
import { JSDOM, VirtualConsole } from 'jsdom'
import { NextResponse } from 'next/server'
import { createClient } from 'redis'

import {
  SearchResultItem,
  SearXNGResponse,
  SearXNGResult,
  SearXNGSearchResults
} from '@/lib/types'
import { readResponseWithLimit, safeFetch } from '@/lib/utils/ssrf-guard'

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

type AdvancedSearchRequestBody = {
  query?: unknown
  maxResults?: unknown
  searchDepth?: unknown
  includeDomains?: unknown
  excludeDomains?: unknown
}

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

function buildCacheKey(params: {
  query: string
  maxResults: number
  searchDepth: string
  includeDomains: string[]
  excludeDomains: string[]
}): string {
  const normalized = {
    query: params.query,
    maxResults: params.maxResults,
    searchDepth: params.searchDepth,
    includeDomains: [...params.includeDomains].sort(),
    excludeDomains: [...params.excludeDomains].sort()
  }
  const digest = createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
  return `search:${digest}`
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function parseSearchDepth(value: unknown): 'basic' | 'advanced' {
  if (value === 'advanced' || value === 'basic') return value
  const defaultDepth = process.env.SEARXNG_DEFAULT_DEPTH
  return defaultDepth === 'advanced' ? 'advanced' : 'basic'
}

function parseMaxResults(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 10
  return Math.min(Math.max(parsed, 1), SEARXNG_MAX_RESULTS)
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
    const body = (await request.json()) as AdvancedSearchRequestBody
    query = typeof body.query === 'string' ? body.query.trim() : ''
    if (!query) {
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

    const maxResults = parseMaxResults(body.maxResults)
    const searchDepth = parseSearchDepth(body.searchDepth)
    const includeDomains = toStringArray(body.includeDomains)
    const excludeDomains = toStringArray(body.excludeDomains)

    const cacheKey = buildCacheKey({
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
  searchDepth: 'basic' | 'advanced' = 'advanced',
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
      generalResults = generalResults.filter(result => {
        try {
          const domain = new URL(result.url).hostname
          return (
            (includeDomains.length === 0 ||
              includeDomains.some(d => domain.includes(d))) &&
            (excludeDomains.length === 0 ||
              !excludeDomains.some(d => domain.includes(d)))
          )
        } catch {
          return false
        }
      })
    }

    if (searchDepth === 'advanced') {
      const crawledResults = await Promise.all(
        generalResults
          .slice(0, maxResults * SEARXNG_CRAWL_MULTIPLIER)
          .map(result => crawlPage(result, query))
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

async function crawlPage(
  result: SearXNGResult,
  query: string
): Promise<SearXNGResult> {
  try {
    const html = await fetchHtmlWithTimeout(result.url, 20000)

    // virtual console to suppress JSDOM warnings
    const virtualConsole = new VirtualConsole()
    virtualConsole.on('error', () => {})
    virtualConsole.on('warn', () => {})

    const dom = new JSDOM(html, {
      runScripts: 'outside-only',
      virtualConsole
    })
    const document = dom.window.document

    // Remove script, style, nav, header, and footer elements
    document
      .querySelectorAll('script, style, nav, header, footer')
      .forEach((el: Element) => el.remove())

    const mainContent =
      document.querySelector('main') ||
      document.querySelector('article') ||
      document.querySelector('.content') ||
      document.querySelector('#content') ||
      document.body

    if (mainContent) {
      // Prioritize specific content elements
      const priorityElements = mainContent.querySelectorAll('h1, h2, h3, p')
      let extractedText = Array.from(priorityElements)
        .map(el => el.textContent?.trim())
        .filter(Boolean)
        .join('\n\n')

      // If not enough content, fall back to other elements
      if (extractedText.length < 500) {
        const contentElements = mainContent.querySelectorAll(
          'h4, h5, h6, li, td, th, blockquote, pre, code'
        )
        extractedText +=
          '\n\n' +
          Array.from(contentElements)
            .map(el => el.textContent?.trim())
            .filter(Boolean)
            .join('\n\n')
      }

      // Extract metadata
      const metaDescription =
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute('content') || ''
      const metaKeywords =
        document
          .querySelector('meta[name="keywords"]')
          ?.getAttribute('content') || ''
      const ogTitle =
        document
          .querySelector('meta[property="og:title"]')
          ?.getAttribute('content') || ''
      const ogDescription =
        document
          .querySelector('meta[property="og:description"]')
          ?.getAttribute('content') || ''

      // Combine metadata with extracted text
      extractedText = `${result.title}\n\n${ogTitle}\n\n${metaDescription}\n\n${ogDescription}\n\n${metaKeywords}\n\n${extractedText}`

      // Limit the extracted text to 10000 characters
      extractedText = extractedText.substring(0, 10000)

      // Highlight query terms in the content
      result.content = highlightQueryTerms(extractedText, query)

      // Extract publication date
      const publishedDate = extractPublicationDate(document)
      if (publishedDate) {
        result.publishedDate = publishedDate.toISOString()
      }
    }

    return result
  } catch (error) {
    console.error(`Error crawling ${result.url}:`, error)
    return {
      ...result,
      content: result.content || 'Content unavailable due to crawling error.'
    }
  }
}

function highlightQueryTerms(content: string, query: string): string {
  try {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 2)
      .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // Escape special characters

    let highlightedContent = content

    terms.forEach(term => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi')
      highlightedContent = highlightedContent.replace(
        regex,
        match => `<mark>${match}</mark>`
      )
    })

    return highlightedContent
  } catch (error) {
    return content // Return original content if highlighting fails
  }
}

function calculateRelevanceScore(result: SearXNGResult, query: string): number {
  try {
    const lowercaseContent = result.content.toLowerCase()
    const lowercaseQuery = query.toLowerCase()
    const queryWords = lowercaseQuery
      .split(/\s+/)
      .filter(word => word.length > 2)
      .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // Escape special characters

    let score = 0

    // Check for exact phrase match
    if (lowercaseContent.includes(lowercaseQuery)) {
      score += 30
    }

    // Check for individual word matches
    queryWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'g')
      const wordCount = (lowercaseContent.match(regex) || []).length
      score += wordCount * 3
    })

    // Boost score for matches in the title
    const lowercaseTitle = result.title.toLowerCase()
    if (lowercaseTitle.includes(lowercaseQuery)) {
      score += 20
    }

    queryWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'g')
      if (lowercaseTitle.match(regex)) {
        score += 10
      }
    })

    // Boost score for recent content (if available)
    if (result.publishedDate) {
      const publishDate = new Date(result.publishedDate)
      const now = new Date()
      const daysSincePublished =
        (now.getTime() - publishDate.getTime()) / (1000 * 3600 * 24)
      if (daysSincePublished < 30) {
        score += 15
      } else if (daysSincePublished < 90) {
        score += 10
      } else if (daysSincePublished < 365) {
        score += 5
      }
    }

    // Penalize very short content
    if (result.content.length < 200) {
      score -= 10
    } else if (result.content.length > 1000) {
      score += 5
    }

    // Boost score for content with more highlighted terms
    const highlightCount = (result.content.match(/<mark>/g) || []).length
    score += highlightCount * 2

    return score
  } catch (error) {
    return 0 // Return 0 if scoring fails
  }
}

function extractPublicationDate(document: Document): Date | null {
  const dateSelectors = [
    'meta[name="article:published_time"]',
    'meta[property="article:published_time"]',
    'meta[name="publication-date"]',
    'meta[name="date"]',
    'time[datetime]',
    'time[pubdate]'
  ]

  for (const selector of dateSelectors) {
    const element = document.querySelector(selector)
    if (element) {
      const dateStr =
        element.getAttribute('content') ||
        element.getAttribute('datetime') ||
        element.getAttribute('pubdate')
      if (dateStr) {
        const date = new Date(dateStr)
        if (!isNaN(date.getTime())) {
          return date
        }
      }
    }
  }

  return null
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

async function fetchHtmlWithTimeout(
  url: string,
  timeoutMs: number
): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await safeFetch(url, {
      headers: {
        accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
        'user-agent': 'MorphicAdvancedSearch/1.0'
      },
      maxRedirects: CRAWL_MAX_REDIRECTS,
      maxResponseBytes: CRAWL_RESPONSE_MAX_BYTES,
      signal: controller.signal
    })
    const contentType = response.headers.get('content-type') || ''
    if (
      contentType &&
      !contentType.includes('text/html') &&
      !contentType.includes('text/plain')
    ) {
      throw new Error(`Unsupported content type: ${contentType}`)
    }
    return await readResponseWithLimit(response, CRAWL_RESPONSE_MAX_BYTES)
  } catch (error) {
    console.error(`Error fetching ${url}:`, error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return `<html><body>Error fetching content: ${errorMessage}</body></html>`
  } finally {
    clearTimeout(timeoutId)
  }
}

function isQualityContent(text: string): boolean {
  const words = text.split(/\s+/).length
  const sentences = text.split(/[.!?]+/).length
  const avgWordsPerSentence = words / sentences

  return (
    words > 50 &&
    sentences > 3 &&
    avgWordsPerSentence > 5 &&
    avgWordsPerSentence < 30 &&
    !text.includes('Content unavailable due to crawling error') &&
    !text.includes('Error fetching content:')
  )
}
