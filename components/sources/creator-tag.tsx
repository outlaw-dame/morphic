'use client'

import type { CreatorInfo } from '@/lib/sources/creator-tag'
import { cn } from '@/lib/utils'

import { GuardedExternalLink } from '@/components/navigation/guarded-external-link'

interface CreatorTagProps {
  creator: CreatorInfo
  className?: string
}

/**
 * Mastodon-style creator attribution tag.
 *
 * Renders a compact, pill-shaped tag showing the creator's handle and platform.
 * Always uses the Mastodon/Fediverse visual language regardless of source platform.
 *
 * Layout:
 * ┌─────────────────────────────────┐
 * │ 🌐  Display Name  @handle       │
 * └─────────────────────────────────┘
 */
export function CreatorTag({ creator, className }: CreatorTagProps) {
  const platformIcon = getPlatformIcon(creator.platform)
  const displayHandle = creator.handle || creator.displayName || 'Author'

  const content = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1',
        'bg-muted/50 text-xs text-muted-foreground',
        'hover:bg-muted hover:text-foreground transition-colors',
        className
      )}
    >
      <span className="text-[10px]" aria-hidden="true">
        {platformIcon}
      </span>
      {creator.displayName && creator.handle && (
        <span className="font-medium text-foreground">
          {creator.displayName}
        </span>
      )}
      <span className="opacity-75">{displayHandle}</span>
    </span>
  )

  if (creator.profileUrl) {
    return (
      <GuardedExternalLink
        href={creator.profileUrl}
        target="_blank"
        className="inline-flex no-underline"
        aria-label={`View ${displayHandle} profile`}
      >
        {content}
      </GuardedExternalLink>
    )
  }

  return content
}

function getPlatformIcon(platform: CreatorInfo['platform']): string {
  switch (platform) {
    case 'bluesky':
      return '🦋'
    case 'mastodon':
    case 'fediverse':
      return '🐘'
    case 'twitter':
      return '𝕏'
    case 'generic':
    default:
      return '✍️'
  }
}
