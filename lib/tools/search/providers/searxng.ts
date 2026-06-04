import {
  SearchResultItem,
  SearchResults,
  SearXNGResponse,
  SearXNGResult,
  SerperSearchResultItem
} from '@/lib/types'

import { BaseSearchProvider } from './base'

export class SearXNGSearchProvider extends BaseSearchProvider {
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
    this.validateApiUrl(apiUrl, 'SEARXNG')
    if (!apiUrl) {
      throw new Error('SEARXNG_API_URL is not set in the environment variables')
    }
    const baseUrl = apiUrl

    try {
      // Construct the URL with query parameters
      const url = new URL(`${baseUrl}/search`)
      url.searchParams.append('q', query)
      url.searchParams.append('format', 'json')
      url.searchParams.append(
        'categories',
        categoriesFor(options?.content_types ?? ['web', 'image'])
      )

      // Apply search depth settings
      if (searchDepth === 'advanced') {
        url.searchParams.append('time_range', '')
        url.searchParams.append('safesearch', '0')
        url.searchParams.append('engines', 'google,bing,duckduckgo,wikipedia')
      } else {
        url.searchParams.append('time_range', 'year')
        url.searchParams.append('safesearch', '1')
        url.searchParams.append('engines', 'google,bing')
      }

      // Apply domain filters if provided
      if (includeDomains.length > 0) {
        url.searchParams.append('site', includeDomains.join(','))
      }

      // Fetch results from SearXNG
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`SearXNG API error (${response.status}):`, errorText)
        throw new Error('Search failed')
      }

      const data: SearXNGResponse = await response.json()

      // Separate general results and image results, and limit to maxResults
      const generalResults = data.results
        .filter(result => !isImageResult(result) && !isVideoResult(result))
        .slice(0, maxResults)
      const imageResults = data.results
        .filter(result => isImageResult(result))
        .slice(0, maxResults)
      const videoResults = data.results
        .filter(result => isVideoResult(result))
        .slice(0, maxResults)

      // Format the results to match the expected SearchResults structure
      return {
        results: generalResults.map(
          (result: SearXNGResult): SearchResultItem => ({
            title: result.title,
            url: result.url,
            content: result.content
          })
        ),
        query: data.query,
        images: imageResults
          .map(result =>
            toAbsoluteUrl(result.img_src || result.thumbnail_src, baseUrl)
          )
          .filter(Boolean),
        videos: videoResults.map((result, index) =>
          toVideoResult(result, index, baseUrl)
        ),
        number_of_results: data.number_of_results
      }
    } catch (error) {
      console.error('SearXNG API error:', error)
      throw error
    }
  }
}

function categoriesFor(
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

function isImageResult(result: SearXNGResult): boolean {
  return Boolean(
    result.template === 'images.html' ||
      (result.img_src && result.category !== 'videos')
  )
}

function isVideoResult(result: SearXNGResult): boolean {
  return Boolean(
    result.template === 'videos.html' ||
      result.category === 'videos' ||
      result.iframe_src
  )
}

function toAbsoluteUrl(value: string | undefined, apiUrl: string): string {
  if (!value) return ''
  return value.startsWith('http') ? value : `${apiUrl}${value}`
}

function toVideoResult(
  result: SearXNGResult,
  index: number,
  apiUrl: string
): SerperSearchResultItem {
  return {
    title: result.title || 'No title',
    link: result.url || result.iframe_src || '',
    snippet: result.content || '',
    imageUrl: toAbsoluteUrl(
      result.thumbnail || result.thumbnail_src || result.img_src,
      apiUrl
    ),
    iframeUrl: toAbsoluteUrl(result.iframe_src, apiUrl) || undefined,
    duration: result.length || result.duration || '',
    source: result.source || result.engine || '',
    channel: result.author || result.source || result.engine || '',
    date: result.publishedDate || result.pubdate || '',
    position: index
  }
}
