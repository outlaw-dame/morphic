import type { SearchResultItem } from '@/lib/types'

import { extractSourceDomain } from './source-metadata'

export interface SourceQuality {
  score: number
  tier: 'high' | 'medium' | 'low'
  signals: string[]
}

const PRIMARY_SUFFIXES = ['.gov', '.edu', '.mil']
const PRIMARY_DOMAINS = new Set([
  'who.int',
  'un.org',
  'europa.eu',
  'nih.gov',
  'cdc.gov',
  'nasa.gov',
  'noaa.gov',
  'fda.gov',
  'sec.gov',
  'congress.gov',
  'courtlistener.com',
  'data.gov',
  'ons.gov.uk',
  'gov.uk',
  'canada.ca',
  'ecdc.europa.eu',
  'oecd.org',
  'worldbank.org',
  'imf.org'
])
const SCHOLARLY_DOMAINS = new Set([
  'nature.com',
  'science.org',
  'nejm.org',
  'thelancet.com',
  'bmj.com',
  'jamanetwork.com',
  'arxiv.org',
  'pubmed.ncbi.nlm.nih.gov',
  'ncbi.nlm.nih.gov',
  'doi.org'
])
const REFERENCE_DOMAINS = new Set([
  'wikipedia.org',
  'wikidata.org',
  'dbpedia.org',
  'britannica.com',
  'stanford.edu'
])
const RECOGNIZED_NEWS_DOMAINS = new Set([
  'apnews.com',
  'reuters.com',
  'bbc.com',
  'bbc.co.uk',
  'npr.org',
  'aljazeera.com',
  'theguardian.com',
  'ft.com',
  'wsj.com',
  'nytimes.com',
  'washingtonpost.com',
  'nbcnews.com',
  'cbsnews.com',
  'abcnews.go.com',
  'pbs.org',
  'propublica.org'
])
const COMMUNITY_DOMAINS = new Set([
  'reddit.com',
  'news.ycombinator.com',
  'quora.com',
  'medium.com',
  'substack.com'
])

const LOW_QUALITY_PATTERNS = [
  /\bcoupon\b/i,
  /\bpromo code\b/i,
  /\bsponsored\b/i,
  /\bcasino\b/i,
  /\bpayday loan\b/i,
  /\bclickbait\b/i
]

const RECENT_QUERY_PATTERN =
  /\b(latest|today|current|recent|breaking|news|now|this week|updates?)\b/i

function domainMatches(domain: string, candidate: string): boolean {
  return domain === candidate || domain.endsWith(`.${candidate}`)
}

function hasDomain(domain: string, domains: Set<string>): boolean {
  for (const candidate of domains) {
    if (domainMatches(domain, candidate)) {
      return true
    }
  }

  return false
}

function isPrimaryDomain(domain: string): boolean {
  return (
    PRIMARY_SUFFIXES.some(suffix => domain.endsWith(suffix)) ||
    hasDomain(domain, PRIMARY_DOMAINS)
  )
}

function textTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(token => token.length >= 4)
  )
}

function queryOverlapScore(result: SearchResultItem, query: string): number {
  const queryTokens = textTokens(query)
  if (queryTokens.size === 0) {
    return 0
  }

  const resultTokens = textTokens(`${result.title} ${result.content}`)
  let overlaps = 0
  for (const token of queryTokens) {
    if (resultTokens.has(token)) {
      overlaps += 1
    }
  }

  return Math.min(12, overlaps * 4)
}

function dateFreshnessScore(
  result: SearchResultItem,
  query: string,
  signals: string[]
): number {
  if (!RECENT_QUERY_PATTERN.test(query)) {
    return 0
  }

  const dateValue = result.publishedAt ?? result.updatedAt
  if (!dateValue) {
    return -4
  }

  const timestamp = new Date(dateValue).getTime()
  if (Number.isNaN(timestamp)) {
    return -4
  }

  const ageDays = (Date.now() - timestamp) / 86_400_000
  if (ageDays <= 2) {
    signals.push('recent')
    return 12
  }
  if (ageDays <= 14) {
    signals.push('fresh')
    return 8
  }
  if (ageDays <= 45) {
    return 3
  }
  if (ageDays > 365) {
    signals.push('stale-for-current-query')
    return -10
  }

  return 0
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function tierForScore(score: number): SourceQuality['tier'] {
  if (score >= 74) {
    return 'high'
  }
  if (score >= 45) {
    return 'medium'
  }
  return 'low'
}

export function scoreSearchResultSource(
  result: SearchResultItem,
  query: string
): SourceQuality {
  const signals: string[] = []
  let score = 38
  const domain = extractSourceDomain(result.url)

  if (domain) {
    if (isPrimaryDomain(domain)) {
      score += 34
      signals.push('primary-source')
    } else if (hasDomain(domain, SCHOLARLY_DOMAINS)) {
      score += 26
      signals.push('scholarly-source')
    } else if (hasDomain(domain, REFERENCE_DOMAINS)) {
      score += 18
      signals.push('reference-source')
    } else if (hasDomain(domain, RECOGNIZED_NEWS_DOMAINS)) {
      score += 15
      signals.push('recognized-publisher')
    } else if (hasDomain(domain, COMMUNITY_DOMAINS)) {
      score -= 4
      signals.push('community-source')
    }
  } else {
    score -= 12
    signals.push('missing-domain')
  }

  if (result.retrievalMethod === 'feed' || result.sourceKind === 'feed-item') {
    score += 14
    signals.push('user-feed')
  }

  if (result.sourceKind === 'podcast' || result.sourceKind === 'video') {
    score += 4
    signals.push(result.sourceKind)
  }

  const usefulTextLength = `${result.title} ${result.content}`.trim().length
  if (usefulTextLength >= 180) {
    score += 6
    signals.push('substantive-snippet')
  } else if (usefulTextLength < 40) {
    score -= 8
    signals.push('thin-snippet')
  }

  score += queryOverlapScore(result, query)
  score += dateFreshnessScore(result, query, signals)

  const combinedText = `${result.title} ${result.content} ${result.url}`
  if (LOW_QUALITY_PATTERNS.some(pattern => pattern.test(combinedText))) {
    score -= 22
    signals.push('low-quality-pattern')
  }

  const clampedScore = clampScore(score)
  return {
    score: clampedScore,
    tier: tierForScore(clampedScore),
    signals
  }
}

export function applySourceQualityToSearchResults(
  results: SearchResultItem[],
  query: string
): SearchResultItem[] {
  return results
    .map((result, index) => {
      const sourceQuality = scoreSearchResultSource(result, query)
      return {
        index,
        result: {
          ...result,
          sourceQuality
        }
      }
    })
    .sort(
      (left, right) =>
        (right.result.sourceQuality?.score ?? 0) -
          (left.result.sourceQuality?.score ?? 0) || left.index - right.index
    )
    .map(item => item.result)
}
