import {
  EvidenceItemSchema,
  SourceClassSchema
} from '@/lib/ai/schemas'
import type { ResolvedEntity } from '@/lib/entities/knowledge-graph'
import { assessSourceQuality } from '@/lib/sources/quality'
import type { SearchResultItem } from '@/lib/types'

import { extractAtomicClaims } from './claim-extraction'
import type {
  EvidenceIngestionIssueCode,
  EvidenceRetrievalProvenance,
  NormalizedEvidenceItem
} from './evidence-types'
import { canonicalizeEvidenceUrl, evidenceIdFromUrl } from './evidence-url'

export type SearchEvidenceNormalizationOptions = {
  retrievedAt?: string | Date
  retrievalPath?: string
  routeDigest?: string
  requireRetrievalProvenance?: boolean
}

export type SearchEvidenceNormalizationResult = Readonly<{
  item: NormalizedEvidenceItem | null
  issue: EvidenceIngestionIssueCode | null
}>

const PATH_PURPOSES = new Set([
  'primary_evidence',
  'independent_corroboration',
  'freshness_check',
  'entity_disambiguation',
  'contradiction_check',
  'background_context',
  'community_experience'
])

function isoDate(
  value: string | Date | undefined,
  fallbackToNow = true
): string | null {
  if (!value) return fallbackToNow ? new Date().toISOString() : null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return fallbackToNow ? new Date().toISOString() : null
  }
  return date.toISOString()
}

function cleanText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized || fallback
}

function resultEntities(result: SearchResultItem): ResolvedEntity[] {
  return Array.isArray(result.entities)
    ? (result.entities as ResolvedEntity[])
    : []
}

function readRetrievalProvenance(
  result: SearchResultItem,
  options: SearchEvidenceNormalizationOptions
): Readonly<{
  value: EvidenceRetrievalProvenance | null
  issue: EvidenceIngestionIssueCode | null
}> {
  const raw = result.retrievalProvenance
  if (raw === undefined || raw === null) {
    return {
      value: null,
      issue: options.requireRetrievalProvenance
        ? 'missing_retrieval_provenance'
        : null
    }
  }
  if (typeof raw !== 'object') {
    return { value: null, issue: 'invalid_retrieval_provenance' }
  }
  if (
    typeof raw.routeDigest !== 'string' ||
    raw.routeDigest.length < 16 ||
    typeof raw.pathId !== 'string' ||
    raw.pathId.length < 1 ||
    raw.pathId.length > 128 ||
    typeof raw.pathPurpose !== 'string' ||
    !PATH_PURPOSES.has(raw.pathPurpose) ||
    !SourceClassSchema.safeParse(raw.sourceClass).success
  ) {
    return { value: null, issue: 'invalid_retrieval_provenance' }
  }
  const retrievedAt = isoDate(raw.retrievedAt, false)
  if (!retrievedAt) {
    return { value: null, issue: 'invalid_retrieval_provenance' }
  }
  if (options.routeDigest && raw.routeDigest !== options.routeDigest) {
    return { value: null, issue: 'route_digest_mismatch' }
  }
  return {
    value: Object.freeze({
      routeDigest: raw.routeDigest,
      pathId: raw.pathId,
      pathPurpose:
        raw.pathPurpose as EvidenceRetrievalProvenance['pathPurpose'],
      plannedSourceClass: raw.sourceClass,
      retrievedAt
    }),
    issue: null
  }
}

export function normalizeSearchResultToEvidenceDetailed(
  result: SearchResultItem,
  index: number,
  options: SearchEvidenceNormalizationOptions = {}
): SearchEvidenceNormalizationResult {
  if (!result || typeof result !== 'object') {
    return { item: null, issue: 'schema_validation_failed' }
  }
  const canonical = canonicalizeEvidenceUrl(result.url)
  if (!canonical) {
    return { item: null, issue: 'invalid_or_unsupported_url' }
  }

  const provenance = readRetrievalProvenance(result, options)
  if (provenance.issue) {
    return { item: null, issue: provenance.issue }
  }

  const title = cleanText(result.title, canonical.host)
  const summary = cleanText(result.content, title)
  const retrievedAt =
    provenance.value?.retrievedAt ?? isoDate(options.retrievedAt)
  const publishedAt = result.publishedAt || result.updatedAt || undefined
  const safePublishedAt = isoDate(publishedAt, false)
  const sourceQuality = assessSourceQuality({
    url: canonical.canonicalUrl,
    title,
    publishedAt: safePublishedAt,
    signals: {
      hasPublicationDate: Boolean(safePublishedAt)
    }
  })
  const claims = extractAtomicClaims(summary)
  const id = evidenceIdFromUrl(`${canonical.canonicalUrl}#${index}`)

  if (!retrievedAt) {
    return { item: null, issue: 'schema_validation_failed' }
  }

  try {
    const evidence = EvidenceItemSchema.parse({
      id,
      url: canonical.canonicalUrl,
      title,
      sourceClass: sourceQuality.sourceClass,
      evidenceRole: sourceQuality.evidenceRole,
      claimIds: claims.map(claim => claim.id),
      quotedText: null,
      summary,
      retrievalPath:
        provenance.value?.pathId ??
        options.retrievalPath ??
        result.retrievalMethod ??
        'search',
      publishedAt: safePublishedAt,
      retrievedAt,
      confidence: sourceQuality.finalWeight
    })

    return {
      item: {
        ...evidence,
        canonicalUrl: canonical.canonicalUrl,
        host: canonical.host,
        originalUrl: canonical.originalUrl,
        sourceQuality,
        entities: resultEntities(result),
        retrievalProvenance: provenance.value
      },
      issue: null
    }
  } catch {
    return { item: null, issue: 'schema_validation_failed' }
  }
}

export function normalizeSearchResultToEvidence(
  result: SearchResultItem,
  index: number,
  options: SearchEvidenceNormalizationOptions = {}
): NormalizedEvidenceItem | null {
  return normalizeSearchResultToEvidenceDetailed(result, index, options).item
}
