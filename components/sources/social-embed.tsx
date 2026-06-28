'use client'

import { cn } from '@/lib/utils'

import { GuardedExternalLink } from '@/components/navigation/guarded-external-link'

export interface SocialEmbedData {
  platform: 'twitter' | 'bluesky' | 'mastodon' | 'threads' | 'unknown'
  url: string
  author?: string
  handle?: string
  content?: string
}

interface SocialEmbedProps {
  embed: SocialEmbedData
  className?: string
}

/**
 * Renders social media content as a Mastodon-style quote card.
 * Styled consistently regardless of source platform.
 */
export function SocialEmbed({ embed, className }: SocialEmbedProps) {
  const icon = getPlatformIcon(embed.platform)
  const platformLabel = getPlatformLabel(embed.platform)

  return (
    <div
      className={cn(
        'my-3 rounded-lg border-l-4 border-primary/30 bg-muted/30 p-4',
        className
      )}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <span aria-hidden="true">{icon}</span>
        <span className="font-medium">{platformLabel}</span>
        {embed.handle && <span className="opacity-75">{embed.handle}</span>}
      </div>
      {embed.author && (
        <p className="text-sm font-medium text-foreground mb-1">
          {embed.author}
        </p>
      )}
      {embed.content && (
        <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
          {embed.content}
        </p>
      )}
      <GuardedExternalLink
        href={embed.url}
        target="_blank"
        className="mt-2 inline-block text-xs text-primary hover:underline"
      >
        View on {platformLabel} →
      </GuardedExternalLink>
    </div>
  )
}

/**
 * Detect social media URLs in article text content.
 * Returns embeddable data for recognized platforms.
 */
export function detectSocialEmbeds(content: string): SocialEmbedData[] {
  const embeds: SocialEmbedData[] = []
  const urlPattern =
    /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com|bsky\.app|mastodon\.social|mstdn\.social|threads\.net)\/[^\s)]+/gi

  const matches = content.match(urlPattern)
  if (!matches) return embeds

  const seen = new Set<string>()
  for (const url of matches) {
    const cleaned = url.replace(/[.,;:!?)\]]+$/, '')
    if (seen.has(cleaned)) continue
    seen.add(cleaned)

    embeds.push({
      platform: detectPlatform(cleaned),
      url: cleaned
    })
  }

  return embeds
}

function detectPlatform(url: string): SocialEmbedData['platform'] {
  if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter'
  if (url.includes('bsky.app')) return 'bluesky'
  if (url.includes('mastodon.social') || url.includes('mstdn.social'))
    return 'mastodon'
  if (url.includes('threads.net')) return 'threads'
  return 'unknown'
}

function getPlatformIcon(platform: SocialEmbedData['platform']): string {
  switch (platform) {
    case 'bluesky':
      return '🦋'
    case 'mastodon':
      return '🐘'
    case 'twitter':
      return '𝕏'
    case 'threads':
      return '🧵'
    default:
      return '🔗'
  }
}

function getPlatformLabel(platform: SocialEmbedData['platform']): string {
  switch (platform) {
    case 'bluesky':
      return 'Bluesky'
    case 'mastodon':
      return 'Mastodon'
    case 'twitter':
      return 'X (Twitter)'
    case 'threads':
      return 'Threads'
    default:
      return 'Social'
  }
}
