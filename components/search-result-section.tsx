'use client'

import type { NormalizedSource, SourceKind } from '@/lib/sources/source-types'
import type { SearchResultImage, SearchResults } from '@/lib/types'
import type { UIMessage } from '@/lib/types/ai'
import { cn } from '@/lib/utils'
import { displayUrlName } from '@/lib/utils/domain'

import { NativeIcon } from '@/components/native/native-icon'
import { GuardedExternalLink } from '@/components/navigation/guarded-external-link'

import { MarkdownMessage } from './message'

type MediaItem = {
  id: string
  title: string
  url: string
  imageUrl?: string
  kind: 'image' | 'video'
  duration?: string
  source?: string
}

type SearchResultSectionProps = {
  userMessage: UIMessage
  assistantMessages: UIMessage[]
  sources: NormalizedSource[]
  citationMaps: Record<string, Record<number, any>>
}

function getTextContent(message: UIMessage): string {
  return (
    message.parts
      ?.filter(
        (part): part is { type: 'text'; text: string } =>
          part.type === 'text' &&
          typeof (part as { text?: unknown }).text === 'string'
      )
      .map(part => part.text)
      .join('\n\n')
      .trim() ?? ''
  )
}

function compactMarkdownText(value: string): string {
  return value.replace(/\n{3,}/g, '\n\n').trim()
}

function sourceKindLabel(kind: SourceKind): string {
  switch (kind) {
    case 'official-doc':
      return 'Official'
    case 'academic':
      return 'Paper'
    case 'podcast':
      return 'Podcast'
    case 'video':
      return 'Video'
    case 'feed-item':
    case 'feed':
      return 'Feed'
    case 'pdf':
      return 'PDF'
    case 'forum':
      return 'Forum'
    default:
      return 'Article'
  }
}

function sourceDate(source: NormalizedSource): string | undefined {
  const value = source.publishedAt ?? source.updatedAt
  if (!value) {
    return undefined
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric'
  })
}

function isPrimaryLikeSource(source: NormalizedSource): boolean {
  const domain = source.domain ?? ''
  return (
    source.kind === 'official-doc' ||
    domain.endsWith('.gov') ||
    domain.endsWith('.edu') ||
    domain === 'who.int' ||
    domain === 'un.org' ||
    domain === 'europa.eu' ||
    domain === 'wikidata.org' ||
    domain === 'dbpedia.org' ||
    source.sourcePreference?.preference === 'trust'
  )
}

function imageFromSearchResult(image: SearchResultImage): MediaItem | null {
  if (typeof image === 'string') {
    return {
      id: image,
      title: 'Image result',
      url: image,
      imageUrl: image,
      kind: 'image'
    }
  }

  if (!image.url) {
    return null
  }

  return {
    id: image.url,
    title: image.title || image.description || 'Image result',
    url: image.sourceUrl || image.url,
    imageUrl: image.url,
    kind: 'image',
    source: image.sourceUrl ? displayUrlName(image.sourceUrl) : undefined
  }
}

function collectMedia(messages: UIMessage[], sources: NormalizedSource[]) {
  const media = new Map<string, MediaItem>()

  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (part.type !== 'tool-search' || part.state !== 'output-available') {
        continue
      }

      const output =
        'output' in part && part.output && typeof part.output === 'object'
          ? (part.output as Partial<SearchResults> & { state?: string })
          : undefined

      if (output?.state !== 'complete') {
        continue
      }

      const searchOutput = output as SearchResults
      for (const image of searchOutput.images ?? []) {
        const item = imageFromSearchResult(image)
        if (item) {
          media.set(item.id, item)
        }
      }

      for (const video of searchOutput.videos ?? []) {
        const url = video.link
        if (!url) {
          continue
        }

        media.set(url, {
          id: url,
          title: video.title || 'Video result',
          url,
          imageUrl: video.imageUrl,
          kind: 'video',
          duration: video.duration,
          source: video.source || video.channel
        })
      }
    }
  }

  for (const source of sources) {
    if (!source.imageUrl || !source.url) {
      continue
    }

    media.set(source.imageUrl, {
      id: source.imageUrl,
      title: source.title,
      url: source.url,
      imageUrl: source.imageUrl,
      kind:
        source.kind === 'video' || source.kind === 'podcast'
          ? 'video'
          : 'image',
      source: source.siteName || source.domain
    })
  }

  return Array.from(media.values()).slice(0, 8)
}

function SourcePill({
  source,
  index
}: {
  source: NormalizedSource
  index: number
}) {
  const primary = isPrimaryLikeSource(source)
  const date = sourceDate(source)
  const host = source.domain || source.siteName || 'source'
  const label = sourceKindLabel(source.kind)

  return (
    <article className="flex h-[166px] w-[292px] shrink-0 flex-col justify-between rounded-[18px] border border-white/10 bg-[#111113]/90 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.24)]">
      <div className="space-y-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#665cff] text-xs font-semibold text-white">
            {index + 1}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-white/55">
            {host}
          </span>
          <NativeIcon
            name="library"
            className="size-4 shrink-0 text-white/55"
            aria-hidden="true"
          />
        </div>
        <h3 className="line-clamp-2 text-base font-semibold leading-snug text-white">
          {source.title}
        </h3>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/65">
          <NativeIcon name="summarize" className="size-3" />
          {label}
        </span>
        {primary ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">
            <NativeIcon name="checkCircle" className="size-3" />
            Primary
          </span>
        ) : null}
        {date ? <span className="text-xs text-white/45">{date}</span> : null}
      </div>
      {source.url ? (
        <GuardedExternalLink
          href={source.url}
          target="_blank"
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#7b75ff]"
        >
          Open
        </GuardedExternalLink>
      ) : null}
    </article>
  )
}

function MediaStrip({ media }: { media: MediaItem[] }) {
  if (media.length === 0) {
    return null
  }

  return (
    <section className="space-y-3" aria-label="Media results">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-white/62">
          <NativeIcon name="summarize" className="size-4" />
          <span>Media</span>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm font-semibold text-[#7b75ff]"
        >
          Explore
          <NativeIcon name="chevronDown" className="-rotate-90 size-3.5" />
        </button>
      </div>
      <div className="-mx-5 flex gap-4 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
        {media.map(item => (
          <GuardedExternalLink
            key={item.id}
            href={item.url}
            target="_blank"
            className="group relative flex h-[158px] w-[232px] shrink-0 overflow-hidden rounded-[22px] border border-white/10 bg-[#161619] text-left"
          >
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imageUrl}
                alt=""
                className="absolute inset-0 size-full object-cover opacity-80 transition-transform duration-300 group-hover:scale-105"
              />
            ) : null}
            <div className="absolute inset-0 bg-linear-to-b from-black/15 via-black/25 to-black/80" />
            <div className="relative z-10 flex size-full flex-col justify-between p-4">
              <span className="flex size-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur">
                <NativeIcon
                  name={item.kind === 'video' ? 'send' : 'summarize'}
                  className="size-3.5"
                />
              </span>
              <div className="space-y-1">
                {item.duration ? (
                  <span className="inline-flex rounded-full bg-black/45 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur">
                    {item.duration}
                  </span>
                ) : null}
                <p className="line-clamp-2 text-sm font-medium text-white">
                  {item.title}
                </p>
              </div>
            </div>
          </GuardedExternalLink>
        ))}
      </div>
    </section>
  )
}

export function SearchResultSection({
  userMessage,
  assistantMessages,
  sources,
  citationMaps
}: SearchResultSectionProps) {
  const query = getTextContent(userMessage)
  const answer = assistantMessages
    .map(getTextContent)
    .filter(Boolean)
    .join('\n\n')
  const answerText = compactMarkdownText(answer)
  const media = collectMedia(assistantMessages, sources)
  const visibleSources = sources.slice(0, 8)
  const hasAnswer = answerText.length > 0
  const reviewCount = visibleSources.filter(
    source => !isPrimaryLikeSource(source)
  ).length

  return (
    <article
      className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-5 pb-12 pt-2 text-white md:px-0"
      data-testid="search-result-section"
    >
      <MediaStrip media={media} />

      {query ? (
        <h1 className="font-serif text-[2.15rem] leading-[1.14] tracking-normal text-white md:text-5xl">
          {query}
        </h1>
      ) : null}

      {visibleSources.length > 0 ? (
        <section className="space-y-3" aria-label="Sources">
          <div className="flex items-center gap-2 text-sm font-medium text-white/62">
            <NativeIcon name="research" className="size-4" />
            <span>Sources</span>
            <span>{visibleSources.length}</span>
          </div>
          <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
            {visibleSources.map((source, index) => (
              <SourcePill key={source.id} source={source} index={index} />
            ))}
          </div>
        </section>
      ) : null}

      {hasAnswer ? (
        <section className="space-y-4" aria-label="Answer">
          <div className="flex items-center gap-2">
            <span className="text-[1.05rem] font-bold tracking-[-0.04em] text-white">
              gist<span className="text-[#665cff]">.</span>
            </span>
            <span className="text-sm font-medium text-white/60">Answer</span>
            <span
              className={cn(
                'ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                sources.length > 0
                  ? reviewCount > 0
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-amber-500/15 text-amber-300'
              )}
            >
              <NativeIcon
                name={sources.length > 0 ? 'checkCircle' : 'warning'}
                className="size-3"
              />
              {sources.length > 0
                ? reviewCount > 0
                  ? `${reviewCount} to review`
                  : 'Supported'
                : 'Needs sources'}
            </span>
          </div>
          <div className="font-serif text-[1.45rem] leading-[1.48] text-white md:text-[1.55rem]">
            <MarkdownMessage
              message={answerText}
              citationMaps={citationMaps}
              className="max-w-none prose-invert prose-p:my-4 prose-p:leading-[1.48] prose-li:my-1 prose-ul:my-4 prose-ol:my-4 prose-strong:text-white prose-a:text-[#8b85ff] [&_*]:tracking-normal"
            />
          </div>
          <div className="flex items-start gap-2 text-xs leading-5 text-white/42">
            <NativeIcon name="info" className="mt-0.5 size-3.5" />
            <span>AI can make mistakes. Double-check important details.</span>
          </div>
        </section>
      ) : (
        <section
          className="rounded-[22px] border border-white/10 bg-white/[0.035] p-5 text-sm text-white/62"
          aria-label="Answer loading"
        >
          gist is checking sources and preparing an answer.
        </section>
      )}
    </article>
  )
}
