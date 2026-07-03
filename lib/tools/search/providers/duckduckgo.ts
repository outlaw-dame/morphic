import type { SearchResultItem, SearchResults } from '@/lib/types'

import { BaseSearchProvider } from './base'
import { SearXNGEngineSearchProvider } from './searxng-engine'

const INSTANT_ANSWER_TIMEOUT_MS = 8000

interface DuckDuckGoRelatedTopic {
  FirstURL?: string
  Text?: string
  Result?: string
  Topics?: DuckDuckGoRelatedTopic[]
}

interface DuckDuckGoInstantAnswerResponse {
  AbstractText?: string
  AbstractURL?: string
  Heading?: string
  Results?: DuckDuckGoRelatedTopic[]
  RelatedTopics?: DuckDuckGoRelatedTopic[]
}

function emptyInstantAnswerResult(
  query: string,
  reason: string
): SearchResults {
  return {
    query,
    images: [],
    results: [],
    number_of_results: 0,
    degraded: true,
    warnings: [
      `DuckDuckGo direct mode returned no usable Instant Answer data (${reason}).`
    ]
  }
}

function stripHtml(value?: string): string {
  return (value ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function topicToResult(topic: DuckDuckGoRelatedTopic): SearchResultItem | null {
  const url = topic.FirstURL
  const text = stripHtml(topic.Text || topic.Result)
  if (!url || !text) {
    return null
  }

  const [title, ...contentParts] = text.split(' - ')
  return {
    title: title || url,
    url,
    content: contentParts.join(' - ') || text,
    provider: 'duckduckgo',
    retrievalMethod: 'search'
  }
}

function flattenTopics(
  topics: DuckDuckGoRelatedTopic[] = []
): DuckDuckGoRelatedTopic[] {
  const flattened: DuckDuckGoRelatedTopic[] = []
  for (const topic of topics) {
    if (topic.Topics?.length) {
      flattened.push(...flattenTopics(topic.Topics))
    } else {
      flattened.push(topic)
    }
  }
  return flattened
}

function matchesDomainFilter(
  result: SearchResultItem,
  includeDomains: string[],
  excludeDomains: string[]
): boolean {
  let hostname: string
  try {
    hostname = new URL(result.url).hostname.toLowerCase()
  } catch {
    return false
  }

  const normalizedIncludes = includeDomains.map(domain => domain.toLowerCase())
  const normalizedExcludes = excludeDomains.map(domain => domain.toLowerCase())

  if (
    normalizedIncludes.length > 0 &&
    !normalizedIncludes.some(domain => hostname.includes(domain))
  ) {
    return false
  }

  return !normalizedExcludes.some(domain => hostname.includes(domain))
}

export class DuckDuckGoSearchProvider extends BaseSearchProvider {
  private readonly searxngProvider = new SearXNGEngineSearchProvider({
    engine: 'duckduckgo',
    label: 'DuckDuckGo'
  })

  constructor() {
    super()
  }

  async search(
    query: string,
    maxResults: number = 10,
    searchDepth: 'basic' | 'advanced' = 'basic',
    includeDomains: string[] = [],
    excludeDomains: string[] = []
  ): Promise<SearchResults> {
    if (process.env.SEARXNG_API_URL) {
      try {
        return await this.searxngProvider.search(
          query,
          maxResults,
          searchDepth,
          includeDomains,
          excludeDomains
        )
      } catch (error) {
        console.warn(
          '[DuckDuckGo] SearXNG unavailable; falling back to official Instant Answer API.',
          error
        )
      }
    }

    return this.searchInstantAnswers(
      query,
      maxResults,
      includeDomains,
      excludeDomains
    )
  }

  private async searchInstantAnswers(
    query: string,
    maxResults: number,
    includeDomains: string[],
    excludeDomains: string[]
  ): Promise<SearchResults> {
    const url = new URL('https://api.duckduckgo.com/')
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'json')
    url.searchParams.set('no_html', '1')
    url.searchParams.set('skip_disambig', '1')

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(INSTANT_ANSWER_TIMEOUT_MS)
    })

    if (!response.ok) {
      throw new Error('DuckDuckGo Instant Answer search failed')
    }

    const body = await response.text()
    if (!body.trim()) {
      return emptyInstantAnswerResult(query, 'empty response')
    }

    let data: DuckDuckGoInstantAnswerResponse
    try {
      data = JSON.parse(body) as DuckDuckGoInstantAnswerResponse
    } catch {
      return emptyInstantAnswerResult(query, 'invalid JSON response')
    }

    const results: SearchResultItem[] = []

    if (data.AbstractURL && data.AbstractText) {
      results.push({
        title: data.Heading || data.AbstractURL,
        url: data.AbstractURL,
        content: data.AbstractText,
        provider: 'duckduckgo',
        retrievalMethod: 'search'
      })
    }

    for (const topic of [
      ...flattenTopics(data.Results),
      ...flattenTopics(data.RelatedTopics)
    ]) {
      const result = topicToResult(topic)
      if (result) {
        results.push(result)
      }
    }

    const deduped = new Map<string, SearchResultItem>()
    for (const result of results) {
      if (
        matchesDomainFilter(result, includeDomains, excludeDomains) &&
        !deduped.has(result.url)
      ) {
        deduped.set(result.url, result)
      }
    }

    const filteredResults = Array.from(deduped.values()).slice(0, maxResults)

    return {
      query,
      images: [],
      results: filteredResults,
      number_of_results: filteredResults.length,
      warnings: [
        'DuckDuckGo direct mode uses the official Instant Answer API, which may return fewer results than full web search.'
      ]
    }
  }
}
