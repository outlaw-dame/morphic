import type { EvidenceItem, SourceQualityAssessment } from '@/lib/ai/schemas'
import type { ResolvedEntity } from '@/lib/entities/knowledge-graph'

import type { AtomicClaim, ClaimCluster } from './claim-extraction'

export type NormalizedEvidenceItem = EvidenceItem & {
  canonicalUrl: string
  host: string
  originalUrl: string
  sourceQuality: SourceQualityAssessment
  entities: ResolvedEntity[]
  duplicateOf?: string
  copiedFrom?: string
}

export type EvidenceDuplicateGroup = {
  canonicalUrl: string
  evidenceIds: string[]
  representativeId: string
}

export type EvidenceGraph = {
  items: NormalizedEvidenceItem[]
  duplicateGroups: EvidenceDuplicateGroup[]
  claimClusters: ClaimCluster[]
  claimsByEvidenceId: Record<string, AtomicClaim[]>
  warnings: string[]
}
