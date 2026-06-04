'use client'

import { useEffect, useRef, useState } from 'react'

import {
  IconHeadphones,
  IconPlayerPlayFilled
} from '@tabler/icons-react'

import { SearchResultItem } from '@/lib/types'
import { displayUrlName } from '@/lib/utils/domain'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

import { GuardedExternalLink } from '@/components/navigation/guarded-external-link'

export interface SearchResultsProps {
  results: SearchResultItem[]
  displayMode?: 'grid' | 'list'
}

function formatTime(seconds?: number) {
  if (seconds === undefined) return undefined
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const secs = safe % 60
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function PodcastTranscriptResult({
  result,
  onPlay,
  compact = false
}: {
  result: SearchResultItem
  onPlay: (result: SearchResultItem) => void
  compact?: boolean
}) {
  const startTime = formatTime(result.transcriptStartTime)
  const sourceLabel = result.feedTitle || getHostname(result.url)

  return (
    <Card className="h-full rounded-md border-primary/20 bg-primary/5 transition-colors hover:bg-primary/10">
      <CardContent
        className={
          compact
            ? 'flex items-start gap-2 p-2'
            : 'flex h-full min-w-0 flex-col gap-2 p-2'
        }
      >
        <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <IconHeadphones className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-xs font-medium">{result.title}</p>
          <button
            type="button"
            onClick={() => onPlay(result)}
            className="mt-1 flex w-full items-start gap-1 rounded-sm text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <IconPlayerPlayFilled className="mt-0.5 size-3 shrink-0 text-primary" />
            <span className={compact ? 'line-clamp-2' : 'line-clamp-3'}>
              {startTime ? `${startTime} - ` : ''}
              {result.transcriptText || result.content}
            </span>
          </button>
          <div className="mt-1 truncate text-xs text-muted-foreground/80">
            {sourceLabel}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function SearchResults({
  results,
  displayMode = 'grid'
}: SearchResultsProps) {
  // State to manage whether to display the results
  const [showAllResults, setShowAllResults] = useState(false)
  const [activeSnippet, setActiveSnippet] = useState<SearchResultItem | null>(
    null
  )
  const audioRef = useRef<HTMLAudioElement>(null)
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleViewMore = () => {
    setShowAllResults(true)
  }

  useEffect(() => {
    if (!activeSnippet?.audioUrl || !audioRef.current) return

    const audio = audioRef.current
    audio.src = activeSnippet.audioUrl
    audio.currentTime = Math.max(0, activeSnippet.transcriptStartTime ?? 0)
    audio.play().catch(() => {})

    if (stopTimerRef.current) clearTimeout(stopTimerRef.current)
    if (
      activeSnippet.transcriptStartTime !== undefined &&
      activeSnippet.transcriptEndTime !== undefined &&
      activeSnippet.transcriptEndTime > activeSnippet.transcriptStartTime
    ) {
      stopTimerRef.current = setTimeout(() => {
        audio.pause()
      }, (activeSnippet.transcriptEndTime - activeSnippet.transcriptStartTime) * 1000)
    }

    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current)
    }
  }, [activeSnippet])

  // Logic for grid mode
  const displayedGridResults = showAllResults ? results : results.slice(0, 3)
  const additionalResultsCount = results.length > 3 ? results.length - 3 : 0

  // --- List Mode Rendering ---
  if (displayMode === 'list') {
    return (
      <div className="flex flex-col gap-2">
        {results.map((result, index) => (
          <div key={index}>
            {result.sourceType === 'podcast_transcript' && result.audioUrl ? (
              <PodcastTranscriptResult
                result={result}
                onPlay={setActiveSnippet}
                compact
              />
            ) : (
              <GuardedExternalLink
                href={result.url}
                target="_blank"
                className="block"
              >
                <Card className="w-full hover:bg-muted/50 transition-colors">
                  <CardContent className="p-2 flex items-start space-x-2">
                    <Avatar className="h-4 w-4 mt-1 shrink-0">
                      <AvatarImage
                        src={`https://www.google.com/s2/favicons?domain=${getHostname(result.url)}`}
                        alt={getHostname(result.url)}
                      />
                      <AvatarFallback className="text-xs">
                        {getHostname(result.url)[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grow overflow-hidden space-y-0.5">
                      <p className="text-sm font-medium line-clamp-1">
                        {result.title || new URL(result.url).pathname}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {result.content}
                      </p>
                      <div className="text-xs text-muted-foreground/80 mt-1 truncate">
                        <span className="underline">
                          {getHostname(result.url)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </GuardedExternalLink>
            )}
          </div>
        ))}
        {activeSnippet?.audioUrl && (
          <audio ref={audioRef} controls className="mt-1 w-full" />
        )}
      </div>
    )
  }

  // --- Grid Mode Rendering (Existing Logic) ---
  return (
    <div className="flex flex-col gap-1 md:-m-1 md:flex-row md:flex-wrap md:gap-0">
      {displayedGridResults.map((result, index) => (
        <div className="min-w-0 md:w-1/4 md:p-1" key={index}>
          {result.sourceType === 'podcast_transcript' && result.audioUrl ? (
            <PodcastTranscriptResult result={result} onPlay={setActiveSnippet} />
          ) : (
            <GuardedExternalLink href={result.url} target="_blank">
              <Card className="h-full flex-1 rounded-md hover:bg-muted/50 transition-colors">
                <CardContent className="flex h-full min-w-0 items-center justify-between gap-2 p-2 md:flex-col md:items-stretch">
                  <p className="min-w-0 flex-1 line-clamp-1 text-xs md:min-h-8 md:line-clamp-2">
                    {result.title || result.content}
                  </p>
                  <div className="flex max-w-[42%] shrink-0 items-center space-x-1 min-w-0 md:mt-2 md:max-w-full md:shrink">
                    <Avatar className="h-4 w-4 shrink-0">
                      <AvatarImage
                        src={`https://www.google.com/s2/favicons?domain=${getHostname(result.url)}`}
                        alt={getHostname(result.url)}
                      />
                      <AvatarFallback>{getHostname(result.url)[0]}</AvatarFallback>
                    </Avatar>
                    <div className="text-xs opacity-60 truncate min-w-0">
                      {displayUrlName(result.url)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </GuardedExternalLink>
          )}
        </div>
      ))}
      {!showAllResults && additionalResultsCount > 0 && (
        <>
          <div className="flex justify-center py-1 md:hidden">
            <Button
              variant="link"
              className="h-auto px-2 py-1 text-muted-foreground"
              onClick={handleViewMore}
            >
              View {additionalResultsCount} more
            </Button>
          </div>
          <div className="hidden md:block md:w-1/4 md:p-1">
            <Card className="flex h-full flex-1 items-center justify-center">
              <CardContent className="p-2">
                <Button
                  variant="link"
                  className="text-muted-foreground"
                  onClick={handleViewMore}
                >
                  View {additionalResultsCount} more
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
      {activeSnippet?.audioUrl && (
        <div className="mt-2 w-full px-1">
          <audio ref={audioRef} controls className="w-full" />
        </div>
      )}
    </div>
  )
}
