import type { SerperSearchResultItem } from '@/lib/types'

export type VideoPlaybackSource =
  | {
      kind: 'iframe'
      src: string
    }
  | {
      kind: 'video'
      src: string
    }
  | {
      kind: 'link'
      src: string
    }

const DIRECT_VIDEO_EXTENSIONS = /\.(mp4|webm|ogv|ogg|mov|m4v)(?:$|[?#])/i

function firstPathSegment(pathname: string): string | undefined {
  return pathname.split('/').filter(Boolean)[0]
}

function lastPathSegment(pathname: string): string | undefined {
  return pathname.split('/').filter(Boolean).pop()
}

function withParams(src: string, params: Record<string, string | undefined>) {
  const url = new URL(src)
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}

export function getYouTubeEmbedUrl(link: string): string | undefined {
  try {
    const url = new URL(link)
    if (url.hostname.includes('youtube.com')) {
      const videoId = url.searchParams.get('v')
      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}?enablejsapi=1`
      }
      if (url.pathname.startsWith('/embed/')) {
        return withParams(`${url.origin}${url.pathname}`, { enablejsapi: '1' })
      }
      if (url.pathname.startsWith('/shorts/')) {
        const videoId = lastPathSegment(url.pathname)
        if (videoId) {
          return `https://www.youtube.com/embed/${videoId}?enablejsapi=1`
        }
      }
    }
    if (url.hostname === 'youtu.be') {
      const videoId = firstPathSegment(url.pathname)
      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}?enablejsapi=1`
      }
    }
  } catch {
    return undefined
  }
}

export function getVimeoEmbedUrl(link: string): string | undefined {
  try {
    const url = new URL(link)
    if (!url.hostname.includes('vimeo.com')) return undefined

    if (
      url.hostname === 'player.vimeo.com' &&
      url.pathname.startsWith('/video/')
    ) {
      return url.toString()
    }

    const segments = url.pathname.split('/').filter(Boolean)
    const videoId = segments.find(segment => /^\d+$/.test(segment))
    if (!videoId) return undefined

    const embedUrl = new URL(`https://player.vimeo.com/video/${videoId}`)
    const hash = url.searchParams.get('h')
    if (hash) embedUrl.searchParams.set('h', hash)
    return embedUrl.toString()
  } catch {
    return undefined
  }
}

export function getPeerTubeEmbedUrl(link: string): string | undefined {
  try {
    const url = new URL(link)
    if (url.pathname.includes('/videos/embed/')) {
      return url.toString()
    }

    const watchMatch = url.pathname.match(/\/videos\/watch\/([^/?#]+)/)
    const shortMatch = url.pathname.match(/\/w\/([^/?#]+)/)
    const videoId = watchMatch?.[1] || shortMatch?.[1]
    if (!videoId) return undefined

    return `${url.origin}/videos/embed/${videoId}`
  } catch {
    return undefined
  }
}

export function getDailymotionEmbedUrl(link: string): string | undefined {
  try {
    const url = new URL(link)
    const isDailymotion =
      url.hostname.includes('dailymotion.com') || url.hostname === 'dai.ly'
    if (!isDailymotion) return undefined

    if (url.pathname.startsWith('/embed/video/')) {
      return url.toString()
    }

    const segments = url.pathname.split('/').filter(Boolean)
    const videoId =
      url.hostname === 'dai.ly'
        ? segments[0]
        : segments[0] === 'video'
          ? segments[1]
          : undefined

    if (!videoId) return undefined
    return `https://www.dailymotion.com/embed/video/${videoId}`
  } catch {
    return undefined
  }
}

export function getTwitchEmbedUrl(
  link: string,
  parentHost?: string
): string | undefined {
  try {
    const url = new URL(link)
    if (!url.hostname.includes('twitch.tv')) return undefined

    const parent = parentHost || 'localhost'

    if (url.hostname === 'clips.twitch.tv') {
      const clip = firstPathSegment(url.pathname)
      return clip
        ? `https://clips.twitch.tv/embed?clip=${clip}&parent=${parent}`
        : undefined
    }

    const segments = url.pathname.split('/').filter(Boolean)
    if (segments[0] === 'videos' && segments[1]) {
      const video = segments[1].startsWith('v')
        ? segments[1]
        : `v${segments[1]}`
      return `https://player.twitch.tv/?video=${video}&parent=${parent}`
    }

    const clipIndex = segments.indexOf('clip')
    if (clipIndex >= 0 && segments[clipIndex + 1]) {
      return `https://clips.twitch.tv/embed?clip=${segments[clipIndex + 1]}&parent=${parent}`
    }

    if (segments[0]) {
      return `https://player.twitch.tv/?channel=${segments[0]}&parent=${parent}`
    }
  } catch {
    return undefined
  }
}

export function getInternetArchiveEmbedUrl(link: string): string | undefined {
  try {
    const url = new URL(link)
    if (!url.hostname.includes('archive.org')) return undefined

    if (url.pathname.startsWith('/embed/')) {
      return url.toString()
    }

    const detailsMatch = url.pathname.match(/\/details\/([^/?#]+)/)
    if (!detailsMatch?.[1]) return undefined

    return `https://archive.org/embed/${detailsMatch[1]}`
  } catch {
    return undefined
  }
}

export function getOwncastEmbedUrl(
  link: string,
  metadataHint: string = ''
): string | undefined {
  try {
    const url = new URL(link)
    if (
      url.pathname === '/embed/video' ||
      url.pathname.startsWith('/embed/video/')
    ) {
      return url.toString()
    }

    // Owncast instances are single-channel sites; the video embed is always
    // rooted at /embed/video on the public instance URL. Require a hint before
    // converting root URLs so generic video results are not misclassified.
    const owncastHint = `${url.hostname} ${metadataHint}`.toLowerCase()
    const isLikelyOwncast = owncastHint.includes('owncast')
    if (
      isLikelyOwncast &&
      (url.pathname === '/' ||
        url.pathname === '' ||
        url.pathname.startsWith('/watch') ||
        url.pathname.startsWith('/stream'))
    ) {
      return `${url.origin}/embed/video`
    }
  } catch {
    return undefined
  }
}

export function getVideoPlaybackSource(
  video: SerperSearchResultItem,
  parentHost?: string
): VideoPlaybackSource {
  if (video.iframeUrl) {
    return { kind: 'iframe', src: video.iframeUrl }
  }

  const iframeSrc =
    getYouTubeEmbedUrl(video.link) ||
    getPeerTubeEmbedUrl(video.link) ||
    getVimeoEmbedUrl(video.link) ||
    getDailymotionEmbedUrl(video.link) ||
    getTwitchEmbedUrl(video.link, parentHost) ||
    getOwncastEmbedUrl(
      video.link,
      `${video.title} ${video.snippet} ${video.source} ${video.channel}`
    ) ||
    getInternetArchiveEmbedUrl(video.link)

  if (iframeSrc) {
    return { kind: 'iframe', src: iframeSrc }
  }

  if (DIRECT_VIDEO_EXTENSIONS.test(video.link)) {
    return { kind: 'video', src: video.link }
  }

  return { kind: 'link', src: video.link }
}
