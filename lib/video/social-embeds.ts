const BLOCKED_HOSTNAMES = new Set(['0.0.0.0', '127.0.0.1', 'localhost', '::1'])

const TRUSTED_EXACT_HOSTS = new Set([
  'archive.org',
  'bsky.app',
  'clips.twitch.tv',
  'embed.bsky.app',
  'loops.video',
  'player.twitch.tv',
  'player.vimeo.com',
  'pixelfed.social',
  'mastodon.social',
  'www.dailymotion.com',
  'www.youtube.com',
  'www.youtube-nocookie.com',
  'youtube.com'
])

const TRUSTED_HOST_SUFFIXES = [
  '.archive.org',
  '.bsky.app',
  '.dailymotion.com',
  '.loops.video'
]

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split('.').map(part => Number(part))
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part))) {
    return false
  }

  const [a, b] = parts
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

export function parseSafeEmbedUrl(raw: string): URL | undefined {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return undefined
    if (url.username || url.password) return undefined

    const hostname = url.hostname.toLowerCase()
    if (
      BLOCKED_HOSTNAMES.has(hostname) ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      isPrivateIpv4(hostname)
    ) {
      return undefined
    }

    return url
  } catch {
    return undefined
  }
}

export function isTrustedProviderIframeUrl(raw: string): boolean {
  const url = parseSafeEmbedUrl(raw)
  if (!url) return false

  const hostname = url.hostname.toLowerCase()
  return (
    TRUSTED_EXACT_HOSTS.has(hostname) ||
    TRUSTED_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix))
  )
}

function hasHint(metadataHint: string, hint: string) {
  return metadataHint.toLowerCase().includes(hint)
}

function isLikelyHost(url: URL, metadataHint: string, marker: string) {
  return (
    url.hostname.toLowerCase().includes(marker) || hasHint(metadataHint, marker)
  )
}

function appendEmbedPath(url: URL, query?: Record<string, string>) {
  const embedUrl = new URL(url.toString())
  if (!embedUrl.pathname.endsWith('/embed')) {
    embedUrl.pathname = `${embedUrl.pathname.replace(/\/$/, '')}/embed`
  }
  embedUrl.search = ''
  for (const [key, value] of Object.entries(query ?? {})) {
    embedUrl.searchParams.set(key, value)
  }
  return embedUrl.toString()
}

export function getMastodonEmbedUrl(
  link: string,
  metadataHint: string = ''
): string | undefined {
  const url = parseSafeEmbedUrl(link)
  if (!url || !isLikelyHost(url, metadataHint, 'mastodon')) return undefined

  if (url.pathname.endsWith('/embed')) return url.toString()

  const isStatusPath =
    /^\/@[^/]+\/\d+\/?$/.test(url.pathname) ||
    /^\/users\/[^/]+\/statuses\/\d+\/?$/.test(url.pathname)

  return isStatusPath ? appendEmbedPath(url) : undefined
}

export function getPixelfedEmbedUrl(
  link: string,
  metadataHint: string = ''
): string | undefined {
  const url = parseSafeEmbedUrl(link)
  if (!url || !isLikelyHost(url, metadataHint, 'pixelfed')) return undefined

  if (url.pathname.endsWith('/embed')) return url.toString()

  const isPostPath =
    /^\/p\/[^/]+\/[^/]+\/?$/.test(url.pathname) ||
    /^\/i\/web\/post\/[^/]+\/?$/.test(url.pathname)

  return isPostPath
    ? appendEmbedPath(url, {
        caption: 'true',
        likes: 'false',
        layout: 'full'
      })
    : undefined
}

export function getLoopsEmbedUrl(
  link: string,
  metadataHint: string = ''
): string | undefined {
  const url = parseSafeEmbedUrl(link)
  if (!url || !isLikelyHost(url, metadataHint, 'loops')) return undefined

  const embedMatch = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]+)\/?$/)
  if (embedMatch) return url.toString()

  const videoMatch = url.pathname.match(/^\/v\/([A-Za-z0-9_-]+)\/?$/)
  if (!videoMatch?.[1]) return undefined

  const embedUrl = new URL(`/embed/${videoMatch[1]}`, url.origin)
  const start = url.searchParams.get('t')
  if (start && /^\d{1,6}$/.test(start)) {
    embedUrl.searchParams.set('t', start)
  }
  return embedUrl.toString()
}

export function getBlueskyEmbedUrl(link: string): string | undefined {
  const url = parseSafeEmbedUrl(link)
  if (!url || url.hostname.toLowerCase() !== 'bsky.app') return undefined
  if (!/^\/profile\/[^/]+\/post\/[^/]+\/?$/.test(url.pathname)) {
    return undefined
  }
  url.search = ''
  url.hash = ''

  return `/api/embed/bluesky?url=${encodeURIComponent(url.toString())}`
}

export function isSubstackUrl(link: string): boolean {
  const url = parseSafeEmbedUrl(link)
  if (!url) return false

  const hostname = url.hostname.toLowerCase()
  return hostname === 'substack.com' || hostname.endsWith('.substack.com')
}
