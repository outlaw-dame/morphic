import Link from 'next/link'

import { listReadingItems } from '@/lib/actions/reading-items'
import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { buildReaderUrl } from '@/lib/sources/reader'

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

export default async function LibraryPage() {
  const userId = await getCurrentUserId()

  if (!userId) {
    return (
      <div className="h-full w-full overflow-y-auto px-4 py-6 md:py-10">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Reading queue
          </p>
          <h1 className="font-[var(--font-display)] text-4xl font-semibold leading-none md:text-5xl">
            Library<span className="text-[var(--indigo)]">.</span>
          </h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            Sign in to save and view sources.
          </p>
          <Link
            href="/auth/login"
            className="gist-primary-button inline-flex h-10 w-fit items-center rounded-full px-4 text-sm font-medium"
          >
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  const result = await listReadingItems(userId)
  const items = result.success ? result.items : []

  return (
    <div className="h-full w-full overflow-y-auto px-4 py-6 md:py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
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

        {!result.success ? (
          <p className="gist-card-surface border border-destructive/30 px-3 py-2 text-sm text-destructive">
            Failed to load saved sources.
          </p>
        ) : null}

        {items.length === 0 ? (
          <div className="gist-card-surface border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            Saved sources will appear here. Use source cards in answers to build
            a reading queue.
          </div>
        ) : (
          <div className="gist-card-surface divide-y divide-[var(--native-hairline)] border">
            {items.map(item => {
              const date = formatDate(item.publishedAt || item.createdAt)
              return (
                <article key={item.id} className="space-y-3 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-semibold uppercase text-[var(--indigo)]">
                      {item.siteName || item.domain || 'Source'}
                    </span>
                    <span className="rounded-full border border-[var(--native-hairline)] px-2 py-0.5">
                      {item.status}
                    </span>
                    {date ? <span>{date}</span> : null}
                  </div>
                  <h2 className="font-[var(--font-serif)] text-xl leading-snug">
                    {item.title}
                  </h2>
                  {item.summary ? (
                    <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {item.summary}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={buildReaderUrl({
                        url: item.url,
                        title: item.title,
                        siteName: item.siteName,
                        sourceId: item.sourceId
                      })}
                      className="inline-flex text-sm font-medium text-[var(--indigo)] underline underline-offset-4"
                    >
                      Reader
                    </Link>
                    <GuardedExternalLink
                      href={item.url}
                      className="inline-flex text-sm font-medium underline underline-offset-4"
                    >
                      Read original
                    </GuardedExternalLink>
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
