import type { SearchResultItem } from '@/lib/types'

import type { EntityMention } from './entity-types'

const QUERY_PREFIXES =
  /^(tell me about|what is|what's|who is|who's|where is|visit|explain|overview of|guide to)\s+/i
const TITLE_SUFFIXES =
  /\s+[-|–—]\s+(wikipedia|wikivoyage|tripadvisor|official.*|travel guide|guide|ultimate guide).*$/i
const MAX_EXTRACTED_CONTENT_CHARS = 180

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function normalizeEntityText(value: string): string | undefined {
  const normalized = normalizeWhitespace(
    value
      .replace(QUERY_PREFIXES, '')
      .replace(TITLE_SUFFIXES, '')
      .replace(/[()[\]{}”"]/g, ' ')
      .replace(/\b(site|official website|homepage)\b/gi, ' ')
      .replace(/[?!.,:;]+$/g, '')
  )

  if (normalized.length < 3 || normalized.length > 96) {
    return undefined
  }

  return normalized
}

function mentionKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function addMention(
  mentions: EntityMention[],
  seen: Set<string>,
  value: string,
  mention: Omit<EntityMention, 'text' | 'normalizedText'>
): void {
  const normalizedText = normalizeEntityText(value)
  if (!normalizedText) return

  const key = mentionKey(normalizedText)
  if (!key || seen.has(key)) return

  seen.add(key)
  mentions.push({
    ...mention,
    text: normalizeWhitespace(value),
    normalizedText
  })
}

function firstSentence(value: string): string {
  return normalizeWhitespace(value).split(/(?<=[.!?])\s+/)[0] ?? ''
}

export function extractEntityMentions(
  query: string,
  results: SearchResultItem[] = [],
  maxMentions = 6
): EntityMention[] {
  const mentions: EntityMention[] = []
  const seen = new Set<string>()

  addMention(mentions, seen, query, {
    source: 'query',
    confidence: 1
  })

  for (const [resultIndex, result] of results.slice(0, 5).entries()) {
    addMention(mentions, seen, result.title, {
      source: 'result_title',
      resultIndex,
      confidence: 0.78
    })

    if (mentions.length >= maxMentions) break

    const contentLead = firstSentence(
      result.content.slice(0, MAX_EXTRACTED_CONTENT_CHARS)
    )
    addMention(mentions, seen, contentLead, {
      source: 'result_content',
      resultIndex,
      confidence: 0.45
    })

    if (mentions.length >= maxMentions) break
  }

  return mentions.slice(0, maxMentions)
}
