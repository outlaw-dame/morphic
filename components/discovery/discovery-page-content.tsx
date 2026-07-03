import Link from 'next/link'

import {
  ControlSlider,
  FireFlame,
  Heart,
  Home,
  MediaImage,
  MediaVideo,
  PlaySolid,
  Search,
  ShareIos
} from 'iconoir-react'

import type {
  DiscoveryPageData,
  DiscoveryStoryCluster
} from '@/lib/discovery/discovery'
import type { NormalizedSource } from '@/lib/sources/source-types'
import { cn } from '@/lib/utils'

import { GuardedExternalLink } from '@/components/navigation/guarded-external-link'

interface DiscoveryPageContentProps {
  data: DiscoveryPageData
}

interface DiscoveryMediaCard {
  id: string
  title: string
  label: string
  kind: 'image' | 'video'
  imageUrl?: string
  duration?: string
  href?: string
  tint: string
}

const STORY_TINTS = [
  'linear-gradient(135deg, #34402f 0%, #172015 100%)',
  'linear-gradient(135deg, #493055 0%, #221728 100%)',
  'linear-gradient(135deg, #75604d 0%, #2a211b 100%)',
  'linear-gradient(135deg, #263f48 0%, #111f25 100%)'
]

function formatGeneratedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  })
}

function displayHost(source?: NormalizedSource) {
  return (
    source?.siteName ||
    source?.domain?.replace(/^www\./, '') ||
    source?.provider ||
    'Source'
  )
}

function estimateReadTime(cluster: DiscoveryStoryCluster) {
  const text = [
    cluster.title,
    cluster.summary,
    ...cluster.sources.map(source => source.summary || source.snippet || '')
  ].join(' ')
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return `${Math.max(1, Math.ceil(words / 225))} min read`
}

function sourcePublishedLabel(source?: NormalizedSource) {
  const value = source?.publishedAt || source?.updatedAt
  if (!value) return undefined

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}

function isVideoLikeSource(source: NormalizedSource) {
  return source.kind === 'video' || source.kind === 'podcast'
}

function buildMediaCards(
  clusters: DiscoveryStoryCluster[]
): DiscoveryMediaCard[] {
  const cards: DiscoveryMediaCard[] = []
  const seen = new Set<string>()

  for (const cluster of clusters) {
    for (const source of cluster.sources) {
      const key = source.imageUrl || source.url || source.id
      if (seen.has(key)) continue
      seen.add(key)

      const isVideo = isVideoLikeSource(source)
      cards.push({
        id: `${cluster.id}-${source.id}`,
        title: source.title || cluster.title,
        label: isVideo ? 'Opening story' : 'Key art',
        kind: isVideo ? 'video' : 'image',
        imageUrl: source.imageUrl,
        duration: isVideo ? '3:42' : undefined,
        href: source.url,
        tint: STORY_TINTS[cards.length % STORY_TINTS.length]
      })
      break
    }

    if (cards.length >= 3) break
  }

  if (cards.length === 0 && clusters.length > 0) {
    return clusters.slice(0, 3).map((cluster, index) => ({
      id: cluster.id,
      title: cluster.title,
      label: index === 0 ? 'Key story' : 'Related story',
      kind: 'image' as const,
      href: cluster.sources[0]?.url,
      tint: STORY_TINTS[index % STORY_TINTS.length]
    }))
  }

  return cards
}

function initialsFor(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('')
}

function MediaCard({
  card,
  front = false,
  className
}: {
  card: DiscoveryMediaCard
  front?: boolean
  className?: string
}) {
  const content = (
    <div
      className={cn(
        'relative flex size-full items-end overflow-hidden rounded-[18px] border border-white/8 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.28)]',
        className
      )}
      style={{ background: card.tint }}
    >
      {card.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.imageUrl}
          alt=""
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-5xl font-semibold text-white/72">
          {initialsFor(card.title)}
        </span>
      )}
      <span className="absolute inset-0 bg-linear-to-b from-black/5 via-black/10 to-black/60" />
      <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/42 px-2.5 py-2 text-[11px] font-medium text-white backdrop-blur-md">
        {card.kind === 'video' ? (
          <MediaVideo className="size-3.5" strokeWidth={1.9} />
        ) : (
          <MediaImage className="size-3.5" strokeWidth={1.9} />
        )}
        {card.duration}
      </span>
      {card.kind === 'video' ? (
        <span className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/60 bg-black/40 text-white backdrop-blur-md">
          <PlaySolid className="ml-0.5 size-6" />
        </span>
      ) : null}
      <span className="relative line-clamp-2 text-sm leading-snug text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.65)]">
        {front ? card.title : card.label}
      </span>
    </div>
  )

  if (!card.href) {
    return content
  }

  return (
    <GuardedExternalLink href={card.href} className="block size-full">
      {content}
    </GuardedExternalLink>
  )
}

function TrendingRow({
  cluster,
  index,
  last
}: {
  cluster: DiscoveryStoryCluster
  index: number
  last: boolean
}) {
  const primarySource = cluster.sources[0]
  const sourceLabel = displayHost(primarySource)
  const published = sourcePublishedLabel(primarySource)
  const meta = [sourceLabel, published, estimateReadTime(cluster)]
    .filter(Boolean)
    .join(' · ')
  const imageUrl = primarySource?.imageUrl
  const content = (
    <article
      className={cn(
        'grid grid-cols-[2rem_minmax(0,1fr)_4rem] items-center gap-4 py-4',
        !last && 'border-b border-white/8'
      )}
    >
      <span className="text-center text-[2rem] font-semibold leading-none text-white/32">
        {index + 1}
      </span>
      <div className="min-w-0">
        <p className="text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-[#6f6cff]">
          {cluster.category}
        </p>
        <h2 className="mt-1 line-clamp-2 font-serif text-[1.55rem] leading-[1.08] tracking-normal text-white">
          {cluster.title}
        </h2>
        <p className="mt-2 truncate text-[0.95rem] text-white/52">{meta}</p>
      </div>
      <div
        className="relative size-16 overflow-hidden rounded-[14px] border border-white/8"
        style={{ background: STORY_TINTS[index % STORY_TINTS.length] }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-lg font-semibold text-white/72">
            {initialsFor(displayHost(primarySource) || cluster.title)}
          </span>
        )}
      </div>
    </article>
  )

  if (!primarySource?.url) {
    return content
  }

  return (
    <GuardedExternalLink href={primarySource.url} className="block">
      {content}
    </GuardedExternalLink>
  )
}

function DiscoveryEmptyState() {
  return (
    <div className="rounded-[22px] border border-dashed border-white/14 bg-white/[0.04] px-5 py-8 text-sm leading-relaxed text-white/58">
      No configured discovery items yet. Add trusted feeds to populate this page
      with source-backed media and stories.
    </div>
  )
}

export function DiscoveryPageContent({ data }: DiscoveryPageContentProps) {
  const generatedAt = formatGeneratedAt(data.generatedAt)
  const clusters = data.clusters
  const mediaCards = buildMediaCards(clusters)
  const heroCard = mediaCards[0]
  const query =
    clusters[0]?.sources.find(source => source.retrievalQuery)
      ?.retrievalQuery ||
    clusters[0]?.category?.toLowerCase() ||
    'your sources'

  return (
    <main className="relative min-h-full overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] overflow-hidden">
        {heroCard?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroCard.imageUrl}
            alt=""
            className="absolute -inset-10 size-[calc(100%+5rem)] object-cover opacity-70 blur-3xl saturate-125"
          />
        ) : (
          <div
            className="absolute -inset-10 opacity-80 blur-3xl"
            style={{
              background: heroCard?.tint ?? STORY_TINTS[0]
            }}
          />
        )}
        <span className="absolute inset-0 bg-linear-to-b from-black/44 via-black/44 to-black" />
      </div>

      <div className="relative mx-auto flex min-h-full w-full max-w-[620px] flex-col px-5 pb-36 pt-5">
        <header className="flex min-h-14 items-center gap-4">
          <Link
            href="/"
            aria-label="Go home"
            className="text-[2rem] font-bold leading-none tracking-[-0.04em] text-white"
          >
            gist<span className="text-[#665cff]">.</span>
          </Link>
          <div className="flex flex-1 items-center gap-2" aria-hidden="true">
            <span className="h-0.5 flex-1 rounded-full bg-white/82" />
            <span className="grid size-11 place-items-center rounded-xl bg-white text-black shadow-[0_10px_28px_rgba(0,0,0,0.26)]">
              <MediaImage className="size-5" strokeWidth={1.9} />
            </span>
            <span className="h-0.5 flex-1 rounded-full bg-white/82" />
            <span className="grid size-11 place-items-center rounded-xl bg-white text-black shadow-[0_10px_28px_rgba(0,0,0,0.26)]">
              <MediaVideo className="size-5" strokeWidth={1.9} />
            </span>
            <span className="h-0.5 flex-[2] rounded-full bg-white/22" />
          </div>
          <Link
            href="/settings"
            aria-label="Open settings"
            className="grid size-11 place-items-center rounded-full bg-linear-to-br from-indigo-500 to-fuchsia-500 text-sm font-bold text-white shadow-[0_12px_34px_rgba(99,102,241,0.32)]"
          >
            s
          </Link>
        </header>

        <form action="/search" className="mt-9">
          <label className="relative inline-flex w-full max-w-[344px] items-center">
            <Search
              className="pointer-events-none absolute left-4 size-5 text-white/58"
              strokeWidth={1.9}
            />
            <input
              name="q"
              defaultValue={`media for ${query}`}
              aria-label="Search discovery"
              className="h-14 w-full rounded-full border border-white/5 bg-white/[0.09] py-0 pl-12 pr-5 text-[1.25rem] text-white outline-hidden backdrop-blur-xl placeholder:text-white/44 focus:border-white/16 focus:bg-white/[0.13]"
            />
          </label>
        </form>

        <section className="relative mt-12 h-[25rem]" aria-label="Media">
          {mediaCards.length > 0 ? (
            <>
              {mediaCards.slice(0, 3).map((card, index) => (
                <div
                  key={card.id}
                  className={cn(
                    'absolute left-1/2 top-1/2 h-44 w-64 transition-transform duration-300',
                    index === 0 && 'z-30 -translate-x-1/2 -translate-y-[56%]',
                    index === 1 &&
                      'z-20 -translate-x-[78%] translate-y-[10%] -rotate-6 opacity-90',
                    index === 2 &&
                      'z-10 -translate-x-[8%] translate-y-[42%] rotate-3 opacity-80'
                  )}
                >
                  <MediaCard card={card} front={index === 0} />
                </div>
              ))}
              <div className="absolute left-1/2 top-1/2 z-40 translate-x-[1rem] translate-y-[2rem] rounded-full bg-white px-5 py-3 text-[1rem] font-semibold text-black shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                Tap to dive in
              </div>
            </>
          ) : (
            <DiscoveryEmptyState />
          )}
        </section>

        <section className="mt-2" aria-label="Trending">
          <div className="mb-2 flex items-center justify-between gap-4">
            <div className="inline-flex items-center gap-2">
              <FireFlame className="size-5 text-[#665cff]" strokeWidth={1.9} />
              <h1 className="text-[0.95rem] font-semibold uppercase tracking-[0.16em] text-white/58">
                Trending
              </h1>
            </div>
            {generatedAt ? (
              <span className="text-sm text-white/42">
                Updated {generatedAt}
              </span>
            ) : null}
          </div>

          {data.feedErrors.length > 0 ? (
            <p className="mb-2 rounded-[14px] border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100/82">
              Some feeds could not be read.
            </p>
          ) : null}

          {clusters.length > 0 ? (
            <div>
              {clusters.slice(0, 8).map((cluster, index) => (
                <TrendingRow
                  key={cluster.id}
                  cluster={cluster}
                  index={index}
                  last={index === Math.min(clusters.length, 8) - 1}
                />
              ))}
            </div>
          ) : (
            <DiscoveryEmptyState />
          )}
        </section>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-44 bg-linear-to-b from-transparent to-black/84" />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[620px] items-center gap-3 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <Link
          href="/"
          aria-label="Home"
          className="grid size-14 shrink-0 place-items-center rounded-[18px] bg-[#1f1f22] text-white shadow-[0_16px_44px_rgba(0,0,0,0.32)]"
        >
          <Home className="size-6" strokeWidth={1.9} />
        </Link>
        <form
          action="/search"
          className="flex min-h-14 flex-1 items-center gap-3 rounded-full border border-white/8 bg-[#1f1f22] px-4 shadow-[0_16px_44px_rgba(0,0,0,0.32)]"
        >
          <ControlSlider
            className="size-5 shrink-0 text-white/68"
            strokeWidth={1.9}
          />
          <input
            name="q"
            placeholder="Ask anything..."
            className="min-w-0 flex-1 bg-transparent text-[1.08rem] text-white outline-hidden placeholder:text-white/42"
          />
          <button
            type="submit"
            aria-label="Search"
            className="grid size-12 shrink-0 place-items-center rounded-full bg-[#665cff] text-white"
          >
            <Search className="size-6" strokeWidth={2} />
          </button>
        </form>
        <button
          type="button"
          aria-label="Like"
          className="hidden size-12 shrink-0 place-items-center rounded-full bg-black/28 text-white backdrop-blur-md min-[520px]:grid"
        >
          <Heart className="size-7" strokeWidth={1.9} />
        </button>
        <button
          type="button"
          aria-label="Share"
          className="hidden size-12 shrink-0 place-items-center rounded-full bg-black/28 text-white backdrop-blur-md min-[520px]:grid"
        >
          <ShareIos className="size-7" strokeWidth={1.9} />
        </button>
      </div>
    </main>
  )
}
