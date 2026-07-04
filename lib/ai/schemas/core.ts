import { z } from 'zod'

export const ResearchModeSchema = z.enum([
  'quick',
  'adaptive',
  'deep',
  'critical'
])
export type ResearchMode = z.infer<typeof ResearchModeSchema>

export const RiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical'])
export type RiskLevel = z.infer<typeof RiskLevelSchema>

export const SourceClassSchema = z.enum([
  'official_source',
  'government_or_regulator',
  'standards_body',
  'academic_or_peer_reviewed',
  'primary_data_source',
  'court_or_legal_record',
  'established_news',
  'specialist_publication',
  'company_or_vendor',
  'independent_blog',
  'forum_or_reddit',
  'social_media',
  'wiki_or_knowledge_graph',
  'content_farm',
  'scraper_or_aggregator',
  'unknown'
])
export type SourceClass = z.infer<typeof SourceClassSchema>

export const EvidenceRoleSchema = z.enum([
  'primary_authority',
  'official_claim',
  'regulatory_or_legal_record',
  'peer_reviewed_or_academic',
  'expert_analysis',
  'original_reporting',
  'independent_review',
  'firsthand_experience',
  'community_signal',
  'background_context',
  'rumor_or_unverified',
  'unsafe_for_factual_claim'
])
export type EvidenceRole = z.infer<typeof EvidenceRoleSchema>

export const ModelRoleSchema = z.enum([
  'router',
  'coordinator',
  'retriever',
  'source_quality',
  'entity_grounding',
  'answer_composer',
  'advisor',
  'citation_verifier',
  'repair'
])
export type ModelRole = z.infer<typeof ModelRoleSchema>

export const ModelCapabilitySchema = z.enum([
  'tool_calling',
  'structured_output',
  'streaming',
  'reasoning',
  'vision',
  'pdf_input',
  'json_mode',
  'local_execution'
])
export type ModelCapability = z.infer<typeof ModelCapabilitySchema>
