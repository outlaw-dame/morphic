import { isCanonicalRouteDigest } from '@/lib/ai/router/execution-context'
import type { SearchResultItem } from '@/lib/types'

import { clusterClaims, extractAtomicClaims } from './claim-extraction'
import { analyzeEvidenceConflicts, conflictWarnings } from './conflict-analysis'
import { markDuplicateEvidence } from './evidence-dedupe'
import type {
  EvidenceGraph,
  EvidenceIngestionIssue,
  NormalizedEvidenceItem
} from './evidence-types'
import { normalizeSearchResultToEvidenceDetailed } from './normalize-search-result'

export type EvidenceGraphInput = {
  query: string
  results: SearchResultItem[]
  retrievedAt?: string | Date
  routeDigest?: string
  requireRetrievalProvenance?: boolean
}

const MAX_EVIDENCE_RESULTS = 500

export function buildEvidenceGraph(input: EvidenceGraphInput): EvidenceGraph {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid evidence graph input.')
  }
  const query = typeof input.query === 'string' ? input.query.trim() : ''
  if (!query || query.length > 16_000) {
    throw new Error('Invalid evidence graph query.')
  }
  if (!Array.isArray(input.results) || input.results.length > MAX_EVIDENCE_RESULTS) {
    throw new Error('Invalid evidence graph results.')
  }
  if (input.requireRetrievalProvenance && !input.routeDigest) {
    throw new Error('Route digest is required for route-bound evidence ingestion.')
  }
  if (
    input.routeDigest !== undefined &&
    !isCanonicalRouteDigest(input.routeDigest)
  ) {
    throw new Error('Invalid evidence graph route digest.')
  }

  const warnings: string[] = []
  const issues: EvidenceIngestionIssue[] = []
  const normalized: NormalizedEvidenceItem[] = []

  input.results.forEach((result, index) => {
    const retrievalPath =
      result && typeof result === 'object' && result.retrievalMethod
        ? result.retrievalMethod
        : 'search'
    const outcome = normalizeSearchResultToEvidenceDetailed(result, index, {
      retrievedAt: input.retrievedAt,
      retrievalPath,
      routeDigest: input.routeDigest,
      requireRetrievalProvenance: input.requireRetrievalProvenance
    })
    if (outcome.item) {
      normalized.push(outcome.item)
      return
    }
    issues.push(
      Object.freeze({
        resultIndex: index,
        code: outcome.issue ?? 'schema_validation_failed'
      })
    )
  })

  if (input.requireRetrievalProvenance && issues.length > 0) {
    const first = issues[0]
    throw new Error(
      `Fusion evidence ingestion failed closed at result ${first.resultIndex}: ${first.code}.`
    )
  }

  if (issues.some(issue => issue.code === 'invalid_or_unsupported_url')) {
    warnings.push(
      'Some results were excluded because their URLs were invalid or unsupported.'
    )
  }
  if (issues.some(issue => issue.code !== 'invalid_or_unsupported_url')) {
    warnings.push(
      'Some results were excluded because their retrieval provenance or schema was invalid.'
    )
  }

  const { items, duplicateGroups } = markDuplicateEvidence(normalized)
  const claimsByEvidenceId = new Map(
    items.map(item => [item.id, extractAtomicClaims(item.summary)] as const)
  )
  const hostByEvidenceId = new Map(
    items.map(item => [item.id, item.host] as const)
  )
  const claimClusters = clusterClaims(claimsByEvidenceId, hostByEvidenceId)
  const ingestion = Object.freeze({
    inputCount: input.results.length,
    admittedCount: items.length,
    excludedCount: issues.length,
    routeDigest: input.routeDigest ?? null,
    requiredRetrievalProvenance: input.requireRetrievalProvenance ?? false,
    issues: Object.freeze([...issues])
  })
  const graphWithoutConflicts: EvidenceGraph = {
    items,
    duplicateGroups,
    claimClusters,
    conflicts: [],
    claimsByEvidenceId: Object.fromEntries(claimsByEvidenceId),
    warnings,
    ingestion
  }
  const conflicts = analyzeEvidenceConflicts(graphWithoutConflicts)

  return {
    ...graphWithoutConflicts,
    conflicts,
    warnings: [...warnings, ...conflictWarnings(conflicts)]
  }
}
