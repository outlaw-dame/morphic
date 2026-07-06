import { EvidenceItemSchema } from '@/lib/ai/schemas'
import type { SearchResultItem } from '@/lib/types'
import { assessSourceQuality } from '@/lib/sources/quality'
import type { ResolvedEntity } from '@/lib/entities/knowledge-graph'

import { extractAtomicClaims } from './claim-extraction'
import type { NormalizedEvidenceItem } from './evidence-types'
import { canonicalizeEvidenceUrl, evidenceIdFromUrl } from './evidence-url'

export type SearchEvidenceNormalizationOptions = {
  retrievedAt?: string | Date
  retrievalPath?: string
}

function isoDate(value: string | Date | undefined): string {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return new Date().toISOString()
  return date.toISOString()
}

function cleanText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized || fallback
}

function resultEntities(result: SearchResultItem): ResolvedEntity[] {
  return Array.isArray(result.entities) ? (result.entities as ResolvedEntity[]) : []
}

export function normalizeSearchResultToEvidence(
  result: SearchResultItem,
  index: number,
  options: SearchEvidenceNormalizationOptions = {}
): NormalizedEvidenceItem | null {
  const canonical = canonicalizeEvidenceUrl(result.url)
  if (!canonical) return null

  const title = cleanText(result.title, canonical.host)
  const summary = cleanText(result.content, title)
  const retrievedAt = isoDate(options.retrievedAt)
  const publishedAt = result.publishedAt || result.updatedAt || undefined
  const sourceQuality = assessSourceQuality({
    url: canonical.canonicalUrl,
    title,
    publishedAt,
    signals: {
      hasPublicationDate: Boolean(publishedAt)
    }
  })
  const claims = extractAtomicClaims(summary)
  const id = evidenceIdFromUrl(`${canonical.canonicalUrl}#${index}`)

  const evidence = EvidenceItemSchema.parse({
    id,
    url: canonical.canonicalUrl,
    title,
    sourceClass: sourceQuality.sourceClass,
    evidenceRole: sourceQuality.evidenceRole,
    claimIds: claims.map(claim => claim.id),
    quotedText: null,
    summary,
    retrievalPath: options.retrievalPath ?? result.retrievalMethod ?? 'search',
    publishedAt: publishedAt ? isoDate(publishedAt) : null,
    retrievedAt,
    confidence: sourceQuality.finalWeight
  })

  return {
    ...evidence,
    canonicalUrl: canonical.canonicalUrl,
    host: canonical.host,
    originalUrl: canonical.originalUrl,
    sourceQuality,
    entities: resultEntities(result)
  }
}
