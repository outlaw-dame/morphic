import type { SearchResultItem } from '@/lib/types'

import { clusterClaims, extractAtomicClaims } from './claim-extraction'
import { analyzeEvidenceConflicts, conflictWarnings } from './conflict-analysis'
import { markDuplicateEvidence } from './evidence-dedupe'
import type { EvidenceGraph } from './evidence-types'
import { normalizeSearchResultToEvidence } from './normalize-search-result'

export type EvidenceGraphInput = {
  query: string
  results: SearchResultItem[]
  retrievedAt?: string | Date
}

export function buildEvidenceGraph(input: EvidenceGraphInput): EvidenceGraph {
  const warnings: string[] = []
  const normalized = input.results
    .map((result, index) =>
      normalizeSearchResultToEvidence(result, index, {
        retrievedAt: input.retrievedAt,
        retrievalPath: result.retrievalMethod ?? 'search'
      })
    )
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  if (normalized.length < input.results.length) {
    warnings.push(
      'Some results were excluded because their URLs were invalid or unsupported.'
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
  const graphWithoutConflicts: EvidenceGraph = {
    items,
    duplicateGroups,
    claimClusters,
    conflicts: [],
    claimsByEvidenceId: Object.fromEntries(claimsByEvidenceId),
    warnings
  }
  const conflicts = analyzeEvidenceConflicts(graphWithoutConflicts)

  return {
    ...graphWithoutConflicts,
    conflicts,
    warnings: [...warnings, ...conflictWarnings(conflicts)]
  }
}
