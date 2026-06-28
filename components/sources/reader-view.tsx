'use client'

import { useEffect, useState } from 'react'

import { GuardedExternalLink } from '@/components/navigation/guarded-external-link'
import { CreatorTag } from '@/components/sources/creator-tag'
import {
  detectSocialEmbeds,
  SocialEmbed
} from '@/components/sources/social-embed'

type ReaderResponse = {
  ok: boolean
  error?: string
  reader?: {
    title: string
    content: string
    sourceUrl: string
    url: string
    domain: string
    siteName?: string
    requestedTitle?: string
    headerImage?: string
    creator?: {
      displayName?: string
      handle?: string
      profileUrl?: string
      platform: 'bluesky' | 'mastodon' | 'twitter' | 'fediverse' | 'generic'
      avatarUrl?: string
    }
  }
}

interface ReaderViewProps {
  apiUrl: string
  sourceUrl: string
  fallbackTitle?: string
  fallbackSiteName?: string
}

export function ReaderView({
  apiUrl,
  sourceUrl,
  fallbackTitle,
  fallbackSiteName
}: ReaderViewProps) {
  const [data, setData] = useState<ReaderResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadReader() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(apiUrl)
        const body = (await response.json()) as ReaderResponse
        if (!response.ok || !body.ok) {
          throw new Error(body.error || 'Failed to load source')
        }
        if (!cancelled) {
          setData(body)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load source'
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadReader()

    return () => {
      cancelled = true
    }
  }, [apiUrl])

  const reader = data?.reader
  const title = reader?.title || fallbackTitle || 'Source reader'
  const siteName = reader?.siteName || fallbackSiteName || reader?.domain

  return (
    <article className="gist-card-surface flex flex-col gap-5 border p-4 md:p-6">
      <header className="space-y-3 border-b border-[var(--native-hairline)] pb-5">
        {reader?.headerImage && (
          <div className="mb-3 overflow-hidden rounded-[var(--native-radius-card)]">
            <img
              src={reader.headerImage}
              alt=""
              className="h-auto max-h-64 w-full object-cover"
              loading="lazy"
            />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {siteName ? (
            <span className="font-semibold uppercase text-[var(--indigo)]">
              {siteName}
            </span>
          ) : null}
          {reader?.domain ? <span>{reader.domain}</span> : null}
        </div>
        <h1 className="font-[var(--font-serif)] text-3xl leading-tight">
          {title}
        </h1>
        {reader?.creator && <CreatorTag creator={reader.creator} />}
        <GuardedExternalLink
          href={reader?.sourceUrl || sourceUrl}
          target="_blank"
          className="break-all text-sm text-muted-foreground underline underline-offset-4"
        >
          {reader?.sourceUrl || sourceUrl}
        </GuardedExternalLink>
      </header>

      {loading ? (
        <div className="rounded-[var(--native-radius-card)] border border-dashed px-4 py-8 text-sm text-muted-foreground">
          Loading source...
        </div>
      ) : error ? (
        <div className="rounded-[var(--native-radius-card)] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : reader?.content ? (
        <div className="text-base leading-8 text-foreground">
          {/* Render social media embeds found in the content */}
          {detectSocialEmbeds(reader.content).length > 0 && (
            <div className="mb-4">
              {detectSocialEmbeds(reader.content).map((embed, i) => (
                <SocialEmbed key={`${embed.url}-${i}`} embed={embed} />
              ))}
            </div>
          )}
          <div className="whitespace-pre-wrap font-[var(--font-serif)] text-lg">
            {reader.content}
          </div>
        </div>
      ) : (
        <div className="rounded-[var(--native-radius-card)] border border-dashed px-4 py-8 text-sm text-muted-foreground">
          No readable text was found for this source.
        </div>
      )}
    </article>
  )
}
