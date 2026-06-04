export type AgenticTaskType =
  | 'simple_answer'
  | 'research'
  | 'code'
  | 'security_review'
  | 'summarization'
  | 'classification'
  | 'reranking'
  | 'citation_audit'
  | 'creative'
  | 'high_risk'

export type AgenticPrivacyLevel =
  | 'local_only'
  | 'private_allowed'
  | 'external_allowed'

export type RoutingDecision = {
  taskType: AgenticTaskType
  privacyLevel: AgenticPrivacyLevel
  difficulty: 'low' | 'medium' | 'high'
  latencyBudgetMs: number
  costBudgetCents: number
  requiresTools: boolean
  requiresFreshness: boolean
  requiresCitations: boolean
  requiresDeterminism: boolean
  escalationPolicy: 'never' | 'on_low_confidence' | 'always_frontier'
}

export type MorphicEvidenceSourceKind =
  | 'web'
  | 'user_feed'
  | 'podcast_transcript'
  | 'community'
  | 'wolfram'
  | 'feed'
  | 'video'
  | 'image'

export type MorphicEvidenceQualityTier =
  | 'primary'
  | 'structured'
  | 'community'
  | 'secondary'
  | 'unknown'

export type MorphicEvidenceItem = {
  id: string
  title: string
  url: string
  content: string
  sourceKind: MorphicEvidenceSourceKind
  qualityTier: MorphicEvidenceQualityTier
  privacyLevel: AgenticPrivacyLevel
  citationRef?: string
  retrievedAt: string
  publishedAt?: string
  provider?: string
}

export type MorphicVerificationIssue = {
  code:
    | 'missing_evidence'
    | 'missing_citations'
    | 'stale_evidence'
    | 'no_primary_sources'
  severity: 'low' | 'medium' | 'high'
  message: string
}

export type MorphicVerificationReport = {
  status: 'supported' | 'needs_review' | 'insufficient'
  confidence: 'low' | 'medium' | 'high'
  evidenceCount: number
  primarySourceCount: number
  issues: MorphicVerificationIssue[]
}
