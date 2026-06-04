import type { FeedSubscription } from '@/lib/config/feed-subscriptions'
import type { SearchResultItem } from '@/lib/types'
import type { FeedItem, PodcastTranscript } from '@/lib/types/feed'
import { readResponseWithLimit, safeFetch } from '@/lib/utils/ssrf-guard'

import { getPreferredPodcastAudioUrl, parseFeedUrl } from '../feed'

type TranscriptSegment = {
  text: string
  startTime?: number
  endTime?: number
}

type ScoredResult = SearchResultItem & {
  score: number
}

const MAX_FEED_ITEMS_PER_FEED = 15
const MAX_TRANSCRIPT_EPISODES_PER_SEARCH = 6
const MAX_TRANSCRIPT_RESULTS_PER_EPISODE = 2
const MAX_TRANSCRIPT_BYTES = 1_500_000

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map(token => token.trim())
        .filter(token => token.length >= 2)
    )
  )
}

function stripTranscriptMarkup(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\\[^}]+}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreText(value: string, query: string, tokens: string[]): number {
  const haystack = value.toLowerCase()
  const phrase = query.trim().toLowerCase()
  let score = phrase && haystack.includes(phrase) ? tokens.length + 4 : 0

  for (const token of tokens) {
    if (haystack.includes(token)) score += 1
  }

  return score
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000 ? value / 1000 : value
  }
  if (typeof value !== 'string') return undefined

  const normalized = value.trim().replace(',', '.')
  const match = normalized.match(
    /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/
  )
  if (!match) {
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parseTimestamp(parsed) : undefined
  }

  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const milliseconds = Number((match[4] ?? '0').padEnd(3, '0'))

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
}

function formatTimestamp(seconds?: number): string | undefined {
  if (seconds === undefined) return undefined
  const safe = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const secs = safe % 60

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`
}

function parseCueTranscript(body: string): TranscriptSegment[] {
  return body
    .replace(/^\uFEFF/, '')
    .split(/\n\s*\n/g)
    .map((block): TranscriptSegment | null => {
      const lines = block
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .filter(line => !/^WEBVTT/i.test(line) && !/^NOTE\b/i.test(line))

      const timingIndex = lines.findIndex(line => line.includes('-->'))
      if (timingIndex === -1) return null

      const [start, end] = lines[timingIndex]
        .split('-->')
        .map(part => part.trim().split(/\s+/)[0])

      const text = stripTranscriptMarkup(lines.slice(timingIndex + 1).join(' '))
      if (!text) return null

      return {
        text,
        startTime: parseTimestamp(start),
        endTime: parseTimestamp(end)
      }
    })
    .filter((segment): segment is TranscriptSegment => segment !== null)
}

function readObjectText(value: any): string | undefined {
  const candidate =
    value?.text ??
    value?.body ??
    value?.content ??
    value?.line ??
    value?.caption ??
    value?.transcript
  return typeof candidate === 'string'
    ? stripTranscriptMarkup(candidate)
    : undefined
}

function parseJsonTranscript(body: string): TranscriptSegment[] {
  const parsed = JSON.parse(body)
  const segments: TranscriptSegment[] = []

  const visit = (value: any) => {
    if (!value || typeof value !== 'object') return

    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }

    const text = readObjectText(value)
    if (text) {
      const startTime = parseTimestamp(
        value.startTime ??
          value.start_time ??
          value.start ??
          value.from ??
          value.offset
      )
      const duration = parseTimestamp(value.duration)
      const endTime =
        parseTimestamp(value.endTime ?? value.end_time ?? value.end ?? value.to) ??
        (startTime !== undefined && duration !== undefined
          ? startTime + duration
          : undefined)

      segments.push({ text, startTime, endTime })
      return
    }

    for (const child of Object.values(value)) visit(child)
  }

  visit(parsed)
  return segments
}

export function parsePodcastTranscript(
  body: string,
  contentType?: string
): TranscriptSegment[] {
  const type = contentType?.toLowerCase() ?? ''
  const trimmed = body.trim()

  if (
    type.includes('json') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[')
  ) {
    return parseJsonTranscript(trimmed)
  }

  if (
    type.includes('vtt') ||
    type.includes('subrip') ||
    /^\s*(WEBVTT|\d+\s*\r?\n[\d:,.]+\s+-->)/i.test(trimmed)
  ) {
    return parseCueTranscript(trimmed)
  }

  const text = stripTranscriptMarkup(trimmed)
  return text ? [{ text }] : []
}

async function fetchTranscript(
  transcript: PodcastTranscript
): Promise<TranscriptSegment[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  let response: Response
  try {
    response = await safeFetch(transcript.url, {
      signal: controller.signal,
      maxRedirects: 3,
      maxResponseBytes: MAX_TRANSCRIPT_BYTES,
      headers: {
        Accept:
          'text/vtt,application/x-subrip,application/json,text/plain,text/html;q=0.7,*/*;q=0.3',
        'User-Agent': 'Morphic/1.0 (podcast transcript search)'
      }
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) return []

  const body = await readResponseWithLimit(response, MAX_TRANSCRIPT_BYTES)
  return parsePodcastTranscript(
    body,
    transcript.type || response.headers.get('content-type') || undefined
  )
}

function itemText(feedTitle: string, item: FeedItem): string {
  return [
    feedTitle,
    item.title,
    item.summary,
    item.content,
    item.author,
    item.published
  ]
    .filter(Boolean)
    .join(' ')
}

function feedResult(
  feedTitle: string,
  feedUrl: string,
  item: FeedItem,
  score: number
): ScoredResult {
  const url = item.url || feedUrl
  return {
    title: item.title,
    url,
    content: item.summary || item.content || `From ${feedTitle}`,
    sourceType: 'user_feed',
    feedTitle,
    feedUrl,
    published: item.published || item.updated,
    score
  }
}

function transcriptResult({
  feedTitle,
  feedUrl,
  item,
  segment,
  audioUrl,
  score
}: {
  feedTitle: string
  feedUrl: string
  item: FeedItem
  segment: TranscriptSegment
  audioUrl: string
  score: number
}): ScoredResult {
  const timestamp = formatTimestamp(segment.startTime)
  const content = timestamp
    ? `Podcast transcript at ${timestamp}: ${segment.text}`
    : `Podcast transcript: ${segment.text}`

  return {
    title: `${feedTitle}: ${item.title}`,
    url: item.url || audioUrl,
    content,
    sourceType: 'podcast_transcript',
    feedTitle,
    feedUrl,
    audioUrl,
    transcriptStartTime: segment.startTime,
    transcriptEndTime: segment.endTime,
    transcriptText: segment.text,
    published: item.published || item.updated,
    score
  }
}

export async function searchUserFeeds({
  query,
  subscriptions,
  maxResults = 6
}: {
  query: string
  subscriptions: FeedSubscription[]
  maxResults?: number
}): Promise<SearchResultItem[]> {
  const tokens = tokenize(query)
  if (!tokens.length || !subscriptions.length) return []

  const results: ScoredResult[] = []
  let transcriptEpisodesSearched = 0

  for (const subscription of subscriptions) {
    try {
      const feed = await parseFeedUrl(subscription.url, MAX_FEED_ITEMS_PER_FEED)
      const feedTitle = feed.title || subscription.title || subscription.url

      for (const item of feed.items) {
        const baseScore = scoreText(itemText(feedTitle, item), query, tokens)
        if (baseScore > 0) {
          results.push(feedResult(feedTitle, feed.url, item, baseScore))
        }

        const transcripts = item.podcast?.transcripts
        const audioUrl = getPreferredPodcastAudioUrl(item)
        if (
          !transcripts?.length ||
          !audioUrl ||
          transcriptEpisodesSearched >= MAX_TRANSCRIPT_EPISODES_PER_SEARCH
        ) {
          continue
        }

        transcriptEpisodesSearched += 1
        const preferredTranscript =
          transcripts.find(transcript =>
            /vtt|subrip|srt|json|plain|text/i.test(transcript.type ?? '')
          ) ?? transcripts[0]

        const segments = await fetchTranscript(preferredTranscript).catch(
          () => []
        )

        segments
          .map(segment => ({
            segment,
            score: scoreText(segment.text, query, tokens)
          }))
          .filter(match => match.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_TRANSCRIPT_RESULTS_PER_EPISODE)
          .forEach(match => {
            results.push(
              transcriptResult({
                feedTitle,
                feedUrl: feed.url,
                item,
                segment: match.segment,
                audioUrl,
                score: match.score + 2
              })
            )
          })
      }
    } catch (error) {
      console.warn('[UserFeedSearch] Feed search failed:', {
        url: subscription.url,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  const seen = new Set<string>()
  return results
    .sort((a, b) => b.score - a.score)
    .filter(result => {
      const key = [
        result.sourceType,
        result.url,
        result.transcriptStartTime ?? '',
        result.title
      ].join('|')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, maxResults)
    .map(({ score: _score, ...result }) => result)
}
