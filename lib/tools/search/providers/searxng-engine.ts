import {
  SearchResultItem,
  SearchResults,
  SearXNGResponse,
  SearXNGResult,
  SerperSearchResultItem
} from '@/lib/types'

import { BaseSearchProvider } from './base'

interface SearXNGEngineProviderOptions {
  engine: string
  label: string
  fallbackEngine?: {
    engine: string
    label: string
  }
}

export class SearXNGEngineSearchProvider extends BaseSearchProvider {
  constructor(private readonly options: SearXNGEngineProviderOptions) {
    super()
  }

  async search(
    query: string,
    maxResults: number = 10,
    searchDepth: 'basic' | 'advanced' = 'basic',
    includeDomains: string[] = [],
    excludeDomains: string[] = [],
    options?: {
      type?: 'general' | 'optimized'
      content_types?: Array<'web' | 'video' | 'image' | 'news'>
    }
  ): Promise<SearchResults> {
    const apiUrl = process.env.SEARXNG_API_URL
    if (!apiUrl) {
      this.validateApiUrl(apiUrl, 'SEARXNG')
      throw new Error('SEARXNG_API_URL is not set in the environment variables')
    }

    let data = await this.fetchEngineResults(
      apiUrl,
      this.options.engine,
        this.options.label,
        query,
        searchDepth,
        includeDomains,
        options?.content_types
      )

    if (
      this.options.fallbackEngine &&
      this.isEngineUnresponsive(data, this.options.engine)
    ) {
      console.warn(
        `${this.options.label} via SearXNG was unresponsive; falling back to ${this.options.fallbackEngine.label}.`
      )
      data = await this.fetchEngineResults(
        apiUrl,
        this.options.fallbackEngine.engine,
        this.options.fallbackEngine.label,
        query,
        searchDepth,
        includeDomains,
        options?.content_types
      )
    }

    const excluded = excludeDomains.map(domain => domain.toLowerCase())
    const matchesExcludedDomain = (result: SearXNGResult) =>
      excluded.some(domain => {
        try {
          return new URL(result.url).hostname.toLowerCase().includes(domain)
        } catch {
          return false
        }
      })

    const generalResults = data.results
      .filter(result => !this.isImageResult(result) && !this.isVideoResult(result))
      .filter(result => !matchesExcludedDomain(result))
      .slice(0, maxResults)
    const imageResults = data.results
      .filter(result => this.isImageResult(result))
      .filter(result => !matchesExcludedDomain(result))
      .slice(0, maxResults)
    const videoResults = data.results
      .filter(result => this.isVideoResult(result))
      .filter(result => !matchesExcludedDomain(result))
      .slice(0, maxResults)

    return {
      results: generalResults.map(
        (result: SearXNGResult): SearchResultItem => ({
          title: result.title,
          url: result.url,
          content: result.content
        })
      ),
      query: data.query || query,
      images: imageResults
        .map(result => this.toAbsoluteUrl(result.img_src || result.thumbnail_src, apiUrl))
        .filter(Boolean),
      videos: videoResults.map((result, index) =>
        this.toVideoResult(result, index, apiUrl)
      ),
      number_of_results: data.number_of_results
    }
  }

  private async fetchEngineResults(
    apiUrl: string,
    engine: string,
    label: string,
    query: string,
    searchDepth: 'basic' | 'advanced',
    includeDomains: string[],
    contentTypes: Array<'web' | 'video' | 'image' | 'news'> = ['web']
  ): Promise<SearXNGResponse> {
    const url = new URL('/search', apiUrl)
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'json')
    url.searchParams.set('categories', this.categoriesFor(contentTypes))
    url.searchParams.set('engines', engine)
    url.searchParams.set('safesearch', searchDepth === 'advanced' ? '0' : '1')

    if (includeDomains.length > 0) {
      url.searchParams.set('site', includeDomains.join(','))
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`${label} via SearXNG error (${response.status}):`, errorText)
      throw new Error(`${label} search failed`)
    }

    return response.json()
  }

  private isEngineUnresponsive(
    data: SearXNGResponse,
    engine: string
  ): boolean {
    return Boolean(
      data.unresponsive_engines?.some(([name]) => name === engine)
    )
  }

  private categoriesFor(
    contentTypes: Array<'web' | 'video' | 'image' | 'news'>
  ): string {
    const categories = new Set<string>()
    if (contentTypes.includes('web')) categories.add('general')
    if (contentTypes.includes('image')) categories.add('images')
    if (contentTypes.includes('video')) categories.add('videos')
    if (contentTypes.includes('news')) categories.add('news')
    if (categories.size === 0) {
      categories.add('general')
      categories.add('images')
    }
    return Array.from(categories).join(',')
  }

  private isImageResult(result: SearXNGResult): boolean {
    return Boolean(
      result.template === 'images.html' ||
        (result.img_src && result.category !== 'videos')
    )
  }

  private isVideoResult(result: SearXNGResult): boolean {
    return Boolean(
      result.template === 'videos.html' ||
        result.category === 'videos' ||
        result.iframe_src
    )
  }

  private toAbsoluteUrl(value: string | undefined, apiUrl: string): string {
    if (!value) return ''
    return value.startsWith('http') ? value : `${apiUrl}${value}`
  }

  private toVideoResult(
    result: SearXNGResult,
    index: number,
    apiUrl: string
  ): SerperSearchResultItem {
    return {
      title: result.title || 'No title',
      link: result.url || result.iframe_src || '',
      snippet: result.content || '',
      imageUrl: this.toAbsoluteUrl(
        result.thumbnail || result.thumbnail_src || result.img_src,
        apiUrl
      ),
      iframeUrl: this.toAbsoluteUrl(result.iframe_src, apiUrl) || undefined,
      duration: result.length || result.duration || '',
      source: result.source || result.engine || '',
      channel: result.author || result.source || result.engine || '',
      date: result.publishedDate || result.pubdate || '',
      position: index
    }
  }
}
