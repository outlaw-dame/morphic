import {
  SourceQualityAssessmentSchema,
  type EvidenceRole,
  type SourceClass,
  type SourceQualityAssessment
} from '@/lib/ai/schemas'

export type SourceQualitySignals = {
  hasAuthor?: boolean
  hasCitations?: boolean
  hasPublicationDate?: boolean
  hasExcessiveAds?: boolean
  isScrapedOrRepublished?: boolean
  hasAIGeneratedPattern?: boolean
  hasClearCorrectionsPolicy?: boolean
}

export type SourceQualityInput = {
  url?: string
  title?: string
  sourceClass?: SourceClass
  evidenceRole?: EvidenceRole
  publishedAt?: string | Date | null
  assessedAt?: string | Date
  corroboratingIndependentSources?: number
  userPreferenceModifier?: number
  signals?: SourceQualitySignals
}

const SOURCE_CLASS_BASE: Record<SourceClass, number> = {
  official_source: 0.95,
  government_or_regulator: 0.94,
  standards_body: 0.93,
  academic_or_peer_reviewed: 0.9,
  primary_data_source: 0.88,
  court_or_legal_record: 0.92,
  established_news: 0.76,
  specialist_publication: 0.72,
  company_or_vendor: 0.58,
  independent_blog: 0.45,
  forum_or_reddit: 0.34,
  social_media: 0.24,
  wiki_or_knowledge_graph: 0.48,
  content_farm: 0.16,
  scraper_or_aggregator: 0.14,
  unknown: 0.32
}

const EVIDENCE_ROLE_BASE: Record<EvidenceRole, number> = {
  primary_authority: 0.95,
  official_claim: 0.82,
  regulatory_or_legal_record: 0.94,
  peer_reviewed_or_academic: 0.9,
  expert_analysis: 0.7,
  original_reporting: 0.72,
  independent_review: 0.6,
  firsthand_experience: 0.42,
  community_signal: 0.32,
  background_context: 0.38,
  rumor_or_unverified: 0.12,
  unsafe_for_factual_claim: 0.02
}

const INFLUENCE_CAPS: Record<SourceClass, number> = {
  official_source: 1,
  government_or_regulator: 1,
  standards_body: 0.96,
  academic_or_peer_reviewed: 0.94,
  primary_data_source: 0.92,
  court_or_legal_record: 0.96,
  established_news: 0.78,
  specialist_publication: 0.72,
  company_or_vendor: 0.52,
  independent_blog: 0.42,
  forum_or_reddit: 0.28,
  social_media: 0.18,
  wiki_or_knowledge_graph: 0.4,
  content_farm: 0.08,
  scraper_or_aggregator: 0.08,
  unknown: 0.24
}

function matchDomain(host: string, domains: string[]): boolean {
  return domains.some(domain => host === domain || host.endsWith(`.${domain}`))
}

const SOURCE_HOST_HINTS: Array<{
  sourceClass: SourceClass
  matches: (host: string) => boolean
}> = [
  {
    sourceClass: 'government_or_regulator',
    matches: host => host.endsWith('.gov') || /\.gov\.[a-z]{2}$/.test(host)
  },
  {
    sourceClass: 'academic_or_peer_reviewed',
    matches: host =>
      host.endsWith('.edu') ||
      /\.edu\.[a-z]{2}$/.test(host) ||
      /\.ac\.[a-z]{2}$/.test(host)
  },
  {
    sourceClass: 'standards_body',
    matches: host => matchDomain(host, ['ietf.org', 'w3.org'])
  },
  {
    sourceClass: 'forum_or_reddit',
    matches: host => matchDomain(host, ['reddit.com'])
  },
  {
    sourceClass: 'social_media',
    matches: host =>
      matchDomain(host, [
        'x.com',
        'twitter.com',
        'facebook.com',
        'instagram.com',
        'tiktok.com',
        'bsky.app'
      ])
  },
  {
    sourceClass: 'wiki_or_knowledge_graph',
    matches: host => matchDomain(host, ['wikipedia.org', 'wikidata.org', 'dbpedia.org'])
  },
  {
    sourceClass: 'scraper_or_aggregator',
    matches: host => matchDomain(host, ['jina.ai', 'archive.is'])
  },
  {
    sourceClass: 'content_farm',
    matches: host => matchDomain(host, ['medium.com', 'substack.com'])
  }
]

const FACTUAL_CLAIM_TYPES = [
  'background_context',
  'user_experience',
  'community_report',
  'product_opinion',
  'emerging_signal'
]

const RESTRICTED_FACTUAL_CLAIM_TYPES = [
  'confirmed_fact',
  'medical_advice',
  'legal_advice',
  'financial_advice',
  'safety_instruction',
  'biographical_fact'
]

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function clampPreference(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(-1, Math.min(1, value))
}

function normalizeDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null
  const date = input instanceof Date ? input : new Date(input)
  return Number.isNaN(date.getTime()) ? null : date
}

function getHost(url: string | undefined): string | null {
  if (!url) return null

  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

export function classifySource(
  input: Pick<SourceQualityInput, 'url' | 'sourceClass'>
): SourceClass {
  if (input.sourceClass) return input.sourceClass

  const host = getHost(input.url)
  if (!host) return 'unknown'

  return SOURCE_HOST_HINTS.find(hint => hint.matches(host))?.sourceClass ?? 'unknown'
}

export function inferEvidenceRole(
  sourceClass: SourceClass,
  explicitRole?: EvidenceRole
): EvidenceRole {
  if (explicitRole) return explicitRole

  switch (sourceClass) {
    case 'official_source':
    case 'government_or_regulator':
      return 'official_claim'
    case 'court_or_legal_record':
      return 'regulatory_or_legal_record'
    case 'standards_body':
    case 'primary_data_source':
      return 'primary_authority'
    case 'academic_or_peer_reviewed':
      return 'peer_reviewed_or_academic'
    case 'established_news':
      return 'original_reporting'
    case 'specialist_publication':
      return 'expert_analysis'
    case 'forum_or_reddit':
      return 'community_signal'
    case 'social_media':
      return 'firsthand_experience'
    case 'content_farm':
    case 'scraper_or_aggregator':
      return 'unsafe_for_factual_claim'
    default:
      return 'background_context'
  }
}

function scoreFreshness(publishedAt: Date | null, assessedAt: Date): number {
  if (!publishedAt) return 0.45

  const ageDays = Math.max(
    0,
    (assessedAt.getTime() - publishedAt.getTime()) / 86_400_000
  )

  if (ageDays <= 7) return 1
  if (ageDays <= 30) return 0.88
  if (ageDays <= 180) return 0.7
  if (ageDays <= 730) return 0.52
  return 0.34
}

function scoreTransparency(signals: SourceQualitySignals | undefined): number {
  const hasAnySignal = signals && Object.values(signals).some(value => value !== undefined)
  if (!hasAnySignal) return 0.5

  let score = 0.45
  if (signals.hasAuthor) score += 0.18
  if (signals.hasPublicationDate) score += 0.12
  if (signals.hasCitations) score += 0.14
  if (signals.hasClearCorrectionsPolicy) score += 0.11
  if (signals.hasExcessiveAds) score -= 0.18

  return clamp01(score)
}

function scoreOriginality(
  sourceClass: SourceClass,
  signals: SourceQualitySignals | undefined
): number {
  if (signals?.isScrapedOrRepublished) return 0.12
  if (sourceClass === 'scraper_or_aggregator') return 0.1
  if (sourceClass === 'content_farm') return 0.22
  if (sourceClass === 'primary_data_source') return 0.95
  if (sourceClass === 'court_or_legal_record') return 0.92
  if (sourceClass === 'forum_or_reddit' || sourceClass === 'social_media') {
    return 0.5
  }
  return 0.62
}

function spamPenalty(
  sourceClass: SourceClass,
  signals: SourceQualitySignals | undefined
): number {
  let penalty = 0
  if (sourceClass === 'content_farm') penalty += 0.35
  if (sourceClass === 'scraper_or_aggregator') penalty += 0.4
  if (signals?.hasExcessiveAds) penalty += 0.15
  if (signals?.hasAIGeneratedPattern) penalty += 0.25
  if (signals?.isScrapedOrRepublished) penalty += 0.2
  return clamp01(penalty)
}

function corroborationScore(count: number | undefined): number {
  if (!count || count <= 0) return 0.15
  if (count === 1) return 0.45
  if (count === 2) return 0.72
  return 0.9
}

function allowedClaimTypes(
  sourceClass: SourceClass,
  evidenceRole: EvidenceRole
): string[] {
  if (
    evidenceRole === 'unsafe_for_factual_claim' ||
    evidenceRole === 'rumor_or_unverified'
  ) {
    return ['background_context']
  }

  if (sourceClass === 'forum_or_reddit' || sourceClass === 'social_media') {
    return FACTUAL_CLAIM_TYPES
  }

  return []
}

function disallowedClaimTypes(
  sourceClass: SourceClass,
  evidenceRole: EvidenceRole
): string[] {
  if (
    sourceClass === 'forum_or_reddit' ||
    sourceClass === 'social_media' ||
    evidenceRole === 'unsafe_for_factual_claim' ||
    evidenceRole === 'rumor_or_unverified'
  ) {
    return RESTRICTED_FACTUAL_CLAIM_TYPES
  }

  return []
}

function requiresCorroboration(
  sourceClass: SourceClass,
  evidenceRole: EvidenceRole
): boolean {
  return (
    sourceClass === 'forum_or_reddit' ||
    sourceClass === 'social_media' ||
    sourceClass === 'company_or_vendor' ||
    sourceClass === 'independent_blog' ||
    evidenceRole === 'community_signal' ||
    evidenceRole === 'firsthand_experience' ||
    evidenceRole === 'rumor_or_unverified'
  )
}

export function assessSourceQuality(input: SourceQualityInput): SourceQualityAssessment {
  const assessedAt = normalizeDate(input.assessedAt) ?? new Date()
  const publishedAt = normalizeDate(input.publishedAt)
  const sourceClass = classifySource(input)
  const evidenceRole = inferEvidenceRole(sourceClass, input.evidenceRole)
  const sourceClassScore = SOURCE_CLASS_BASE[sourceClass]
  const evidenceRoleScore = EVIDENCE_ROLE_BASE[evidenceRole]
  const topicalAuthorityScore = clamp01((sourceClassScore + evidenceRoleScore) / 2)
  const transparencyScore = scoreTransparency(input.signals)
  const originalityScore = scoreOriginality(sourceClass, input.signals)
  const freshnessScore = scoreFreshness(publishedAt, assessedAt)
  const corroboration = corroborationScore(input.corroboratingIndependentSources)
  const conflictOfInterestPenalty = sourceClass === 'company_or_vendor' ? 0.2 : 0
  const spamOrContentFarmPenalty = spamPenalty(sourceClass, input.signals)
  const userPreferenceModifier = clampPreference(input.userPreferenceModifier ?? 0)
  const influenceCap = INFLUENCE_CAPS[sourceClass]

  const rawWeight =
    sourceClassScore * 0.25 +
    evidenceRoleScore * 0.2 +
    topicalAuthorityScore * 0.18 +
    transparencyScore * 0.12 +
    originalityScore * 0.12 +
    freshnessScore * 0.08 +
    corroboration * 0.05 -
    conflictOfInterestPenalty -
    spamOrContentFarmPenalty

  const finalWeight = clamp01(
    Math.min(influenceCap, rawWeight + userPreferenceModifier * 0.08)
  )

  return SourceQualityAssessmentSchema.parse({
    sourceClass,
    evidenceRole,
    sourceClassScore,
    topicalAuthorityScore,
    transparencyScore,
    originalityScore,
    freshnessScore,
    corroborationScore: corroboration,
    conflictOfInterestPenalty,
    spamOrContentFarmPenalty,
    userPreferenceModifier,
    finalWeight,
    influenceCap,
    requiresCorroboration: requiresCorroboration(sourceClass, evidenceRole),
    allowedClaimTypes: allowedClaimTypes(sourceClass, evidenceRole),
    disallowedClaimTypes: disallowedClaimTypes(sourceClass, evidenceRole)
  })
}
