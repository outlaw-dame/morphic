import type {
  EvidenceItem,
  SourceClass,
  SourceQualityAssessment
} from '@/lib/ai/schemas'
import type { ResolvedEntity } from '@/lib/entities/knowledge-graph'

import type { AtomicClaim, ClaimCluster } from './claim-extraction'

export type EvidenceConflictSeverity = 'info' | 'warn' | 'block'

export type EvidenceConflictType =
  | 'negation_overlap'
  | 'numeric_mismatch'
  | 'status_mismatch'

export type EvidenceConflict = {
  id: string
  type: EvidenceConflictType
  severity: EvidenceConflictSeverity
  evidenceIds: string[]
  claimIds: string[]
  reason: string
}

export type EvidenceRetrievalProvenance = Readonly<{
  routeDigest: string
  pathId: string
  pathPurpose:
    | 'primary_evidence'
    | 'independent_corroboration'
    | 'freshness_check'
    | 'entity_disambiguation'
    | 'contradiction_check'
    | 'background_context'
    | 'community_experience'
  plannedSourceClass: SourceClass
  retrievedAt: string
}>

export type EvidenceIngestionIssueCode =
  | 'invalid_or_unsupported_url'
  | 'missing_retrieval_provenance'
  | 'invalid_retrieval_provenance'
  | 'route_digest_mismatch'
  | 'schema_validation_failed'

export type EvidenceIngestionIssue = Readonly<{
  resultIndex: number
  code: EvidenceIngestionIssueCode
}>

export type EvidenceIngestionReport = Readonly<{
  inputCount: number
  admittedCount: number
  excludedCount: number
  routeDigest: string | null
  requiredRetrievalProvenance: boolean
  issues: readonly EvidenceIngestionIssue[]
}>

export type NormalizedEvidenceItem = EvidenceItem & {
  canonicalUrl: string
  host: string
  originalUrl: string
  sourceQuality: SourceQualityAssessment
  entities: ResolvedEntity[]
  retrievalProvenance: EvidenceRetrievalProvenance | null
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
  conflicts: EvidenceConflict[]
  claimsByEvidenceId: Record<string, AtomicClaim[]>
  warnings: string[]
  ingestion: EvidenceIngestionReport
}
