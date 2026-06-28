/**
 * Creator tag extraction from article HTML metadata.
 *
 * Extracts social media creator/author attribution from HTML meta tags.
 * Priority: Bluesky > Mastodon/Fediverse > Twitter/X
 *
 * Renders in a Mastodon-style creator tag format regardless of source platform.
 */

import { parse } from 'node-html-parser'

export interface CreatorInfo {
  /** Display name of the creator */
  displayName?: string
  /** Handle/username (e.g., @user@instance.social or @user) */
  handle?: string
  /** Full profile URL */
  profileUrl?: string
  /** Platform the creator was found on */
  platform: 'bluesky' | 'mastodon' | 'twitter' | 'fediverse' | 'generic'
  /** Avatar URL if available */
  avatarUrl?: string
}

/**
 * Extract creator info from HTML content.
 *
 * Checks meta tags in priority order:
 * 1. Fediverse/Mastodon: `fediverse:creator`, `mastodon:creator`
 * 2. Bluesky: `bluesky:creator`, `at-uri` patterns
 * 3. Twitter/X: `twitter:creator`, `twitter:site`
 * 4. Generic: `article:author`, `author` meta tags
 */
export function extractCreatorFromHtml(html: string): CreatorInfo | null {
  const root = parse(html)
  const metaTags = root.querySelectorAll('meta')

  let bluesky: CreatorInfo | null = null
  let mastodon: CreatorInfo | null = null
  let twitter: CreatorInfo | null = null
  let generic: CreatorInfo | null = null

  for (const meta of metaTags) {
    const name = (
      meta.getAttribute('name') ||
      meta.getAttribute('property') ||
      ''
    ).toLowerCase()
    const content = meta.getAttribute('content')?.trim()

    if (!content) continue

    // Fediverse / Mastodon creator
    if (
      name === 'fediverse:creator' ||
      name === 'mastodon:creator' ||
      name === 'fediverse:author'
    ) {
      mastodon = parseFediverseHandle(content)
    }

    // Bluesky creator
    if (name === 'bluesky:creator' || name === 'bsky:creator') {
      bluesky = parseBlueskyHandle(content)
    }

    // Twitter/X creator
    if (name === 'twitter:creator' && !twitter) {
      twitter = parseTwitterHandle(content)
    }
    if (name === 'twitter:site' && !twitter) {
      twitter = parseTwitterHandle(content)
    }

    // Generic author
    if ((name === 'article:author' || name === 'author') && !generic) {
      generic = parseGenericAuthor(content)
    }
  }

  // Also check link[rel="author"] and link[rel="me"]
  const authorLinks = root.querySelectorAll(
    'link[rel="author"], link[rel="me"]'
  )
  for (const link of authorLinks) {
    const href = link.getAttribute('href')?.trim()
    if (!href) continue

    if (href.includes('bsky.app') || href.includes('bsky.social')) {
      bluesky = bluesky || parseBlueskyUrl(href)
    } else if (isFediverseUrl(href)) {
      mastodon = mastodon || parseFediverseUrl(href)
    } else if (href.includes('twitter.com') || href.includes('x.com')) {
      twitter = twitter || parseTwitterUrl(href)
    }
  }

  // Priority: Bluesky > Mastodon > Twitter > Generic
  return bluesky || mastodon || twitter || generic
}

/**
 * Extract creator info from a URL and optional metadata.
 * Useful when you have the source URL but not the full HTML.
 */
export function extractCreatorFromMetadata(meta: {
  author?: string
  twitterHandle?: string
  fediHandle?: string
  blueskyHandle?: string
}): CreatorInfo | null {
  if (meta.blueskyHandle) return parseBlueskyHandle(meta.blueskyHandle)
  if (meta.fediHandle) return parseFediverseHandle(meta.fediHandle)
  if (meta.twitterHandle) return parseTwitterHandle(meta.twitterHandle)
  if (meta.author) return parseGenericAuthor(meta.author)
  return null
}

// --- Parsers ---

function parseFediverseHandle(value: string): CreatorInfo {
  // Format: @user@instance.social
  const cleaned = value.startsWith('@') ? value : `@${value}`
  const parts = cleaned.split('@').filter(Boolean)

  return {
    handle: cleaned,
    displayName: parts[0],
    profileUrl:
      parts.length >= 2 ? `https://${parts[1]}/@${parts[0]}` : undefined,
    platform: 'mastodon'
  }
}

function parseBlueskyHandle(value: string): CreatorInfo {
  // Format: @user.bsky.social or user.bsky.social or did:plc:...
  const cleaned = value.startsWith('@') ? value.slice(1) : value
  const handle = cleaned.includes('.') ? cleaned : `${cleaned}.bsky.social`

  return {
    handle: `@${handle}`,
    displayName: handle.split('.')[0],
    profileUrl: `https://bsky.app/profile/${handle}`,
    platform: 'bluesky'
  }
}

function parseTwitterHandle(value: string): CreatorInfo {
  const handle = value.startsWith('@') ? value : `@${value}`
  const username = handle.slice(1)

  return {
    handle,
    displayName: username,
    profileUrl: `https://x.com/${username}`,
    platform: 'twitter'
  }
}

function parseGenericAuthor(value: string): CreatorInfo {
  // Could be a URL or a name
  if (value.startsWith('http')) {
    return {
      displayName: undefined,
      profileUrl: value,
      platform: 'generic'
    }
  }

  return {
    displayName: value,
    platform: 'generic'
  }
}

function parseBlueskyUrl(url: string): CreatorInfo {
  try {
    const parsed = new URL(url)
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    // https://bsky.app/profile/user.bsky.social
    if (pathParts[0] === 'profile' && pathParts[1]) {
      return {
        handle: `@${pathParts[1]}`,
        displayName: pathParts[1].split('.')[0],
        profileUrl: url,
        platform: 'bluesky'
      }
    }
  } catch {
    // Invalid URL
  }
  return { profileUrl: url, platform: 'bluesky' }
}

function parseFediverseUrl(url: string): CreatorInfo {
  try {
    const parsed = new URL(url)
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    // https://mastodon.social/@user
    if (pathParts[0]?.startsWith('@')) {
      const username = pathParts[0].slice(1)
      return {
        handle: `@${username}@${parsed.hostname}`,
        displayName: username,
        profileUrl: url,
        platform: 'mastodon'
      }
    }
  } catch {
    // Invalid URL
  }
  return { profileUrl: url, platform: 'mastodon' }
}

function parseTwitterUrl(url: string): CreatorInfo {
  try {
    const parsed = new URL(url)
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    if (pathParts[0]) {
      return {
        handle: `@${pathParts[0]}`,
        displayName: pathParts[0],
        profileUrl: url,
        platform: 'twitter'
      }
    }
  } catch {
    // Invalid URL
  }
  return { profileUrl: url, platform: 'twitter' }
}

function isFediverseUrl(url: string): boolean {
  const fediverseHosts = [
    'mastodon.social',
    'mastodon.online',
    'mstdn.social',
    'fosstodon.org',
    'hachyderm.io',
    'infosec.exchange',
    'techhub.social',
    'mas.to',
    'social.coop'
  ]
  try {
    const parsed = new URL(url)
    return (
      fediverseHosts.includes(parsed.hostname) ||
      parsed.pathname.startsWith('/@')
    )
  } catch {
    return false
  }
}
