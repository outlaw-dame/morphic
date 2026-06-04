import {
  FirecrawlClient,
  FirecrawlImageResult,
  FirecrawlNewsResult,
  FirecrawlWebResult
} from '@/lib/firecrawl'
import { BaseSearchProvider } from '@/lib/tools/search/providers/base'
import { SearchResults } from '@/lib/types'

export class FirecrawlSearchProvider extends BaseSearchProvider {
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
    const apiKey = process.env.FIRECRAWL_API_KEY
    this.validateApiKey(apiKey, 'FIRECRAWL')

    const firecrawl = new FirecrawlClient(apiKey)

    const contentTypes = options?.content_types ?? ['web', 'image']
    const sources: ('web' | 'news' | 'images')[] = []
    if (contentTypes.includes('web')) {
      sources.push('web')
    }
    if (contentTypes.includes('news') || searchDepth === 'advanced') {
      sources.push('news')
    }
    if (contentTypes.includes('image')) {
      sources.push('images')
    }
    if (sources.length === 0) {
      sources.push('web')
    }

    const response = await firecrawl.search({
      query,
      sources,
      limit: maxResults
      // Note: Firecrawl Search API support for include/exclude domains depends
      // on endpoint version; the local client currently does not pass them.
    })

    const resources: (FirecrawlWebResult | FirecrawlNewsResult)[] = [
      ...(response.data?.web || []),
      ...(response.data?.news || [])
    ]

    const results = resources.map(resource => {
      if ('markdown' in resource) {
        const markdown = resource.markdown.slice(0, 1000)
        return {
          title: resource.title || '',
          url: resource.url,
          content: markdown || resource.description || ''
        }
      }

      return {
        title: resource.title || '',
        url: resource.url,
        content: resource.snippet || ''
      }
    })

    const images =
      response.data?.images?.map((img: FirecrawlImageResult) => ({
        url: img.imageUrl,
        description: img.title || ''
      })) || []

    return {
      results,
      query,
      images,
      videos: [],
      number_of_results: results.length
    }
  }
}
