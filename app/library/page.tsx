import Link from 'next/link'

import { listReadingItems } from '@/lib/actions/reading-items'
import { getCurrentUserId } from '@/lib/auth/get-current-user'
import type { ReadingItem } from '@/lib/db/schema'
import { buildReaderUrl } from '@/lib/sources/reader'
import type { ReadingItemStatus } from '@/lib/sources/reading-items'
import { cn } from '@/lib/utils'

import { NativeIcon } from '@/components/native/native-icon'
import { GuardedExternalLink } from '@/components/navigation/guarded-external-link'

export const metadata = {
  title: 'Library — gist.',
  description: 'Saved sources and reading queue.'
}

function formatDate(value?: Date | string | null) {
  if (!value) {
    return undefined
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const statusFilters: Array<{
  label: string
  value: ReadingItemStatus | 'all'
}> = [
  { label: 'All', value: 'all' },
  { label: 'Unread', value: 'unread' },
  { label: 'Reading', value: 'reading' },
  { label: 'Read', value: 'read' },
  { label: 'Archived', value: 'archived' }
]

const statusStyles: Record<ReadingItemStatus, string> = {
  unread:
    'bg-[color-mix(in_oklch,var(--indigo)_14%,transparent)] text-[var(--indigo)]',
  reading:
    'bg-[color-mix(in_oklch,var(--warn)_16%,transparent)] text-[var(--warn)]',
  read: 'bg-[color-mix(in_oklch,var(--ok)_14%,transparent)] text-[var(--ok)]',
  archived:
    'bg-[color-mix(in_oklch,var(--muted)_70%,transparent)] text-muted-foreground'
}

function humanizeStatus(status: ReadingItemStatus) {
  return status[0].toUpperCase() + status.slice(1)
}

function buildStatusCounts(items: ReadingItem[]) {
  return items.reduce(
    (counts, item) => {
      counts[item.status] += 1
      return counts
    },
    { unread: 0, reading: 0, read: 0, archived: 0 } satisfies Record<
      ReadingItemStatus,
      number
    >
  )
}

function getFilterHref(status: ReadingItemStatus | 'all') {
  return status === 'all' ? '/library' : `/library?status=${status}`
}

function getRequestedStatus(value?: string): ReadingItemStatus | undefined {
  return value === 'unread' ||
    value === 'reading' ||
    value === 'read' ||
    value === 'archived'
    ? value
    : undefined
}

function SourceThumb({ item }: { item: ReadingItem }) {
  if (item.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Saved-source images can come from arbitrary domains; keep them lazy and no-referrer instead of broadening next/image remotePatterns.
      <img
        src={item.imageUrl}
        alt=""
        className="size-20 rounded-2xl object-cover md:size-22"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    )
  }

  if (item.faviconUrl) {
    return (
      <div className="flex size-20 items-center justify-center rounded-2xl border border-[var(--native-hairline)] bg-[color-mix(in_oklch,var(--indigo)_10%,var(--card))] md:size-22">
        {/* eslint-disable-next-line @next/next/no-img-element -- Favicon URLs are source metadata and may not match the app's static image allowlist. */}
        <img
          src={item.faviconUrl}
          alt=""
          className="size-7 object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
    )
  }

  return (
    <div className="flex size-20 items-center justify-center rounded-2xl border border-[var(--native-hairline)] bg-[color-mix(in_oklch,var(--indigo)_10%,var(--card))] text-[var(--indigo)] md:size-22">
      <NativeIcon name="library" className="size-6" />
    </div>
  )
}

export default async function LibraryPage(props: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await props.searchParams
  const requestedStatus = getRequestedStatus(status)
  const userId = await getCurrentUserId()

  if (!userId) {
    return (
      <div className="h-full w-full overflow-y-auto px-4 py-6 md:py-10">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <LibraryHeader savedCount={0} />
          <div className="gist-card-surface flex flex-col items-start gap-4 border border-dashed p-5 md:p-7">
            <div className="flex size-11 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--indigo)_12%,transparent)] text-[var(--indigo)]">
              <NativeIcon name="library" className="size-5" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">
                Save sources into your library.
              </h2>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                Sign in to keep reader-ready articles, original links, and
                source metadata attached to your account.
              </p>
            </div>
            <Link
              href="/auth/login"
              className="gist-primary-button inline-flex h-11 items-center rounded-full px-4 text-sm font-medium"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const result = await listReadingItems(userId)
  const items = result.success ? result.items : []
  const statusCounts = buildStatusCounts(items)
  const visibleItems = requestedStatus
    ? items.filter(item => item.status === requestedStatus)
    : items

  return (
    <div className="h-full w-full overflow-y-auto px-4 py-6 md:py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <LibraryHeader savedCount={items.length} />

        <div className="gist-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {statusFilters.map(filter => {
            const count =
              filter.value === 'all' ? items.length : statusCounts[filter.value]
            const active =
              filter.value === 'all'
                ? !requestedStatus
                : filter.value === requestedStatus
            return (
              <Link
                key={filter.value}
                href={getFilterHref(filter.value)}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-[background-color,border-color,color]',
                  active
                    ? 'bg-foreground text-background'
                    : 'border border-[var(--native-hairline)] text-muted-foreground hover:border-[color-mix(in_oklch,var(--indigo)_30%,var(--native-hairline))] hover:text-foreground'
                )}
              >
                {filter.label}
                <span
                  className={cn(
                    'text-xs',
                    active ? 'text-background/70' : 'text-muted-foreground'
                  )}
                >
                  {count}
                </span>
              </Link>
            )
          })}
        </div>

        {!result.success ? (
          <div className="gist-card-surface flex items-center gap-3 border border-destructive/30 px-4 py-3 text-sm text-destructive">
            <NativeIcon name="warning" className="size-4 shrink-0" />
            <span>Failed to load saved sources.</span>
          </div>
        ) : null}

        {visibleItems.length === 0 ? (
          <div className="gist-card-surface flex flex-col items-center gap-3 border border-dashed px-4 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--indigo)_12%,transparent)] text-[var(--indigo)]">
              <NativeIcon name="library" className="size-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold">
                {items.length === 0
                  ? 'No saved sources yet'
                  : `No ${requestedStatus} sources`}
              </h2>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                {items.length === 0
                  ? 'Save source cards from answers to build a reading queue for later verification.'
                  : 'Try another status filter or save more sources from answers.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="gist-card-surface divide-y divide-[var(--native-hairline)] border">
            {visibleItems.map(item => {
              const date = formatDate(item.publishedAt || item.createdAt)
              return (
                <article
                  key={item.id}
                  className="flex min-w-0 gap-3 px-3 py-4 transition-colors hover:bg-[color-mix(in_oklch,var(--indigo)_4%,transparent)] md:gap-4 md:px-4"
                >
                  <SourceThumb item={item} />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          statusStyles[item.status]
                        )}
                      >
                        {humanizeStatus(item.status)}
                      </span>
                      <span className="font-semibold uppercase text-[var(--indigo)]">
                        {item.siteName || item.domain || 'Source'}
                      </span>
                      {date ? <span>{date}</span> : null}
                    </div>
                    <h2 className="line-clamp-2 font-[var(--font-serif)] text-xl leading-snug">
                      {item.title}
                    </h2>
                    {item.summary ? (
                      <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                        {item.summary}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={buildReaderUrl({
                          url: item.url,
                          title: item.title,
                          siteName: item.siteName,
                          sourceId: item.sourceId
                        })}
                        className="inline-flex h-8 items-center gap-1 rounded-full bg-[color-mix(in_oklch,var(--indigo)_12%,transparent)] px-3 text-sm font-medium text-[var(--indigo)]"
                      >
                        <NativeIcon name="library" className="size-3.5" />
                        Reader
                      </Link>
                      <GuardedExternalLink
                        href={item.url}
                        className="inline-flex h-8 items-center gap-1 rounded-full border border-[var(--native-hairline)] px-3 text-sm font-medium"
                      >
                        <NativeIcon name="externalLink" className="size-3.5" />
                        Original
                      </GuardedExternalLink>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function LibraryHeader({ savedCount }: { savedCount: number }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          Reading queue
        </p>
        <h1 className="font-[var(--font-display)] text-4xl font-semibold leading-none md:text-5xl">
          Library<span className="text-[var(--indigo)]">.</span>
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
          Saved sources, original links, and reader-ready articles for later
          verification.
        </p>
      </div>
      <span className="rounded-full border border-[var(--native-hairline)] px-3 py-1 text-xs text-muted-foreground">
        {savedCount} saved
      </span>
    </div>
  )
}
