'use client'

import { useState } from 'react'

import { OpenNewWindow } from 'iconoir-react'

import { SearchResultItem } from '@/lib/types'
import { cn } from '@/lib/utils'
import { displayUrlName } from '@/lib/utils/domain'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

import { GuardedExternalLink } from '@/components/navigation/guarded-external-link'

export interface SearchResultsProps {
  results: SearchResultItem[]
  displayMode?: 'grid' | 'list'
}

interface DisplaySearchResult {
  content: string
  domain: string
  faviconUrl?: string
  hostnameInitial: string
  siteLabel: string
  title: string
  url?: string
}

function toDisplaySearchResult(result: SearchResultItem): DisplaySearchResult {
  try {
    const url = new URL(result.url)
    const domain = url.hostname

    return {
      content: result.content || '',
      domain,
      faviconUrl: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
      hostnameInitial: domain[0]?.toUpperCase() || '?',
      siteLabel: displayUrlName(result.url),
      title: result.title || url.pathname || domain,
      url: result.url
    }
  } catch {
    const fallbackTitle = result.title || result.content || 'Search result'

    return {
      content: result.content || '',
      domain: 'Source',
      hostnameInitial: fallbackTitle[0]?.toUpperCase() || '?',
      siteLabel: 'Source',
      title: fallbackTitle
    }
  }
}

export function SearchResults({
  results,
  displayMode = 'grid'
}: SearchResultsProps) {
  // State to manage whether to display the results
  const [showAllResults, setShowAllResults] = useState(false)

  const handleViewMore = () => {
    setShowAllResults(true)
  }

  // Logic for grid mode
  const displayedGridResults = showAllResults ? results : results.slice(0, 3)
  const additionalResultsCount = results.length > 3 ? results.length - 3 : 0
  const displayedResults = displayedGridResults.map(toDisplaySearchResult)
  const listResults = results.map(toDisplaySearchResult)

  // --- List Mode Rendering ---
  if (displayMode === 'list') {
    return (
      <div className="flex flex-col gap-2" data-testid="search-results-list">
        {listResults.map((result, index) => (
          <SearchResultSurface key={index} result={result} displayMode="list" />
        ))}
      </div>
    )
  }

  // --- Grid Mode Rendering (Existing Logic) ---
  return (
    <div
      className="grid grid-cols-1 gap-2 md:grid-cols-3"
      data-testid="search-results-grid"
    >
      {displayedResults.map((result, index) => (
        <SearchResultSurface key={index} result={result} displayMode="grid" />
      ))}
      {!showAllResults && additionalResultsCount > 0 && (
        <Button
          variant="outline"
          className="gist-card-surface min-h-24 justify-center border border-dashed px-3 text-sm text-muted-foreground"
          onClick={handleViewMore}
        >
          View {additionalResultsCount} more
        </Button>
      )}
    </div>
  )
}

function SearchResultSurface({
  result,
  displayMode
}: {
  result: DisplaySearchResult
  displayMode: 'grid' | 'list'
}) {
  const content = (
    <article
      className={cn(
        'gist-card-surface group flex min-w-0 gap-3 border p-3 text-left transition-[background-color,border-color,transform] duration-[140ms] ease-[var(--motion-ease-out)]',
        'hover:border-[color-mix(in_oklch,var(--indigo)_34%,var(--native-hairline))] hover:bg-[color-mix(in_oklch,var(--indigo)_5%,var(--card))]',
        'active:scale-[0.99]',
        displayMode === 'grid'
          ? 'min-h-32 flex-col justify-between'
          : 'items-start'
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Avatar className="mt-0.5 size-6 shrink-0 border border-[var(--native-hairline)] bg-background">
          {result.faviconUrl ? (
            <AvatarImage src={result.faviconUrl} alt={result.domain} />
          ) : null}
          <AvatarFallback className="text-[10px]">
            {result.hostnameInitial}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <h4 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
            {result.title}
          </h4>
          {displayMode === 'list' && result.content ? (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {result.content}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate">{result.siteLabel}</span>
        {result.url ? (
          <OpenNewWindow className="size-3.5 shrink-0 opacity-50 transition-opacity group-hover:opacity-80" />
        ) : null}
      </div>
    </article>
  )

  if (!result.url) {
    return content
  }

  return (
    <GuardedExternalLink
      href={result.url}
      target="_blank"
      className="block min-w-0"
    >
      {content}
    </GuardedExternalLink>
  )
}
