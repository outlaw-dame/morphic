import {
  buildOwncastSearchQuery,
  isLikelyOwncastResult
} from '@/lib/config/video-sources'
import type {
  SearchResultItem,
  SearchResults,
  SerperSearchResultItem
} from '@/lib/types'

import type { SearchProvider } from './providers'

export function shouldSearchOwncastSources({
  query,
  contentTypes,
  includeDomains
}: {
  query: string
  contentTypes: Array<'web' | 'video' | 'image' | 'news'>
  includeDomains: string[]
}) {
  if (process.env.ENABLE_OWNCAST_SEARCH === 'false') return false
  if (!query.trim()) return false
  if (includeDomains.length > 0) return false
  return contentTypes.includes('video')
}

function webResultToOwncastVideo(
  result: SearchResultItem,
  position: number
): SerperSearchResultItem {
  return {
    title: result.title,
    link: result.url,
    snippet: result.content,
    imageUrl: '',
    duration: '',
    source: result.communitySource || result.sourceType || 'Owncast',
    channel: 'Owncast',
    date: result.published ?? '',
    position
  }
}

export async function searchOwncastSources({
  provider,
  query,
  searchDepth,
  excludeDomains,
  maxResults = 3
}: {
  provider: SearchProvider
  query: string
  searchDepth: 'basic' | 'advanced'
  excludeDomains: string[]
  maxResults?: number
}): Promise<SerperSearchResultItem[]> {
  try {
    const results = await provider.search(
      buildOwncastSearchQuery(query),
      maxResults,
      searchDepth,
      [],
      excludeDomains,
      {
        type: 'general',
        content_types: ['web', 'video']
      }
    )

    const videos = (results.videos ?? [])
      .filter(video => isLikelyOwncastResult(video))
      .map((video, index) => ({
        ...video,
        source: video.source || 'Owncast',
        channel: video.channel || 'Owncast',
        position: video.position || index + 1
      }))

    const webVideos = (results.results ?? [])
      .filter(result =>
        isLikelyOwncastResult({
          link: result.url,
          title: result.title,
          snippet: result.content,
          source: result.sourceType ?? '',
          channel: result.communitySource ?? ''
        })
      )
      .map((result, index) =>
        webResultToOwncastVideo(result, videos.length + index + 1)
      )

    return [...videos, ...webVideos].slice(0, maxResults)
  } catch (error) {
    console.warn('[OwncastSearch] Search failed:', error)
    return []
  }
}

export function mergeVideoResults(
  searchResult: SearchResults,
  extraVideos: SerperSearchResultItem[]
): SearchResults {
  if (extraVideos.length === 0) return searchResult

  const seen = new Set<string>()
  const videos = [...extraVideos, ...(searchResult.videos ?? [])].filter(
    video => {
      const key = video.link.trim().toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    }
  )

  return {
    ...searchResult,
    videos
  }
}
