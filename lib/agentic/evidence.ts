import type { SearchResultItem, SearchResults } from '@/lib/types'

import type {
  AgenticPrivacyLevel,
  MorphicEvidenceItem,
  MorphicEvidenceQualityTier,
  MorphicEvidenceSourceKind
} from './types'
import type { RoutingDecision } from './types'
import { verifyEvidenceSet } from './verifier'

const PRIMARY_SOURCE_HOST_PATTERNS = [
  /\.gov$/,
  /\.edu$/,
  /^docs\./,
  /^developers\./,
  /^developer\./,
  /(^|\.)github\.com$/,
  /(^|\.)arxiv\.org$/,
  /(^|\.)w3\.org$/,
  /(^|\.)ietf\.org$/,
  /(^|\.)nextjs\.org$/,
  /(^|\.)openai\.com$/,
  /(^|\.)cloudflare\.com$/,
  /(^|\.)anthropic\.com$/,
  /(^|\.)google\.com$/,
  /(^|\.)microsoft\.com$/,
  /(^|\.)wolframalpha\.com$/
]

function hostnameFor(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

function sourceKindFor(result: SearchResultItem): MorphicEvidenceSourceKind {
  return result.sourceType ?? 'web'
}

function privacyFor(result: SearchResultItem): AgenticPrivacyLevel {
  return result.sourceType === 'user_feed' ||
    result.sourceType === 'podcast_transcript'
    ? 'private_allowed'
    : 'external_allowed'
}

function qualityFor(result: SearchResultItem): MorphicEvidenceQualityTier {
  if (result.sourceType === 'community') return 'community'
  if (
    result.sourceType === 'user_feed' ||
    result.sourceType === 'podcast_transcript'
  ) {
    return 'structured'
  }

  const hostname = hostnameFor(result.url)
  if (PRIMARY_SOURCE_HOST_PATTERNS.some(pattern => pattern.test(hostname))) {
    return 'primary'
  }

  return hostname ? 'secondary' : 'unknown'
}

export function normalizeSearchEvidence(
  searchResults: SearchResults,
  options: {
    retrievedAt?: string
    provider?: string
  } = {}
): MorphicEvidenceItem[] {
  const retrievedAt = options.retrievedAt ?? new Date().toISOString()
  const toolCallId = searchResults.toolCallId ?? 'search'

  return (searchResults.results ?? []).map((result, index) => ({
    id: `${toolCallId}:${index + 1}`,
    title: result.title,
    url: result.url,
    content: result.transcriptText || result.content,
    sourceKind: sourceKindFor(result),
    qualityTier: qualityFor(result),
    privacyLevel: privacyFor(result),
    citationRef: `[${index + 1}](#${toolCallId})`,
    retrievedAt,
    publishedAt: result.published,
    provider: options.provider
  }))
}

export function annotateSearchResultsWithEvidence(
  searchResults: SearchResults,
  decision: RoutingDecision,
  options: {
    retrievedAt?: string
    provider?: string
  } = {}
): SearchResults {
  const evidence = normalizeSearchEvidence(searchResults, options)

  return {
    ...searchResults,
    evidence,
    evidenceVerification: verifyEvidenceSet(evidence, decision, {
      now: options.retrievedAt
    })
  }
}
