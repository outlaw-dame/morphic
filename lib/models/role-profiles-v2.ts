import type {
  ModelCapability,
  ModelRole
} from '@/lib/ai/schemas'

import type {
  RegisteredModel,
  ReliabilityTier
} from './registry-v2'

export type ToolPermissionClass =
  | 'none'
  | 'approved_retrieval_executor'
  | 'approved_internal_tools'

export type StructuredOutputStrategy =
  | 'native_schema'
  | 'json_mode_with_validation'
  | 'deterministic_only'

export type RoleFallback =
  | { kind: 'deterministic'; id: string }
  | { kind: 'no_model'; id: string }

export type RoleFitnessProfile = {
  role: ModelRole
  hardCapabilities: readonly ModelCapability[]
  preferredCapabilities: readonly ModelCapability[]
  minimumReliability: ReliabilityTier
  minimumContextTokens: number
  maximumLatencyClass: RegisteredModel['latencyClass']
  maximumCostClass: RegisteredModel['costClass']
  allowedLocalities: readonly RegisteredModel['locality'][]
  allowedPrivacyClasses: readonly RegisteredModel['privacyClasses'][number][]
  requiresCancellation: boolean
  toolPermissionClass: ToolPermissionClass
  structuredOutputStrategy: StructuredOutputStrategy
  minimumQualityScore: number
  fallbackChain: readonly RoleFallback[]
  preferDifferentFamilyFromRole?: ModelRole
}

export const ROLE_FITNESS_PROFILES: Readonly<
  Record<ModelRole, RoleFitnessProfile>
> = Object.freeze({
  router: {
    role: 'router',
    hardCapabilities: ['structured_output'],
    preferredCapabilities: ['reasoning', 'json_mode'],
    minimumReliability: 'standard',
    minimumContextTokens: 8_000,
    maximumLatencyClass: 'low',
    maximumCostClass: 'medium',
    allowedLocalities: ['local', 'remote'],
    allowedPrivacyClasses: ['public', 'private', 'sensitive'],
    requiresCancellation: true,
    toolPermissionClass: 'none',
    structuredOutputStrategy: 'native_schema',
    minimumQualityScore: 0.8,
    fallbackChain: [{ kind: 'deterministic', id: 'deterministic_router_v1' }]
  },
  coordinator: {
    role: 'coordinator',
    hardCapabilities: ['structured_output', 'reasoning'],
    preferredCapabilities: ['json_mode'],
    minimumReliability: 'strong',
    minimumContextTokens: 32_000,
    maximumLatencyClass: 'medium',
    maximumCostClass: 'high',
    allowedLocalities: ['local', 'remote'],
    allowedPrivacyClasses: ['public', 'private', 'sensitive'],
    requiresCancellation: true,
    toolPermissionClass: 'approved_internal_tools',
    structuredOutputStrategy: 'native_schema',
    minimumQualityScore: 0.85,
    fallbackChain: [{ kind: 'deterministic', id: 'coordinator_policy_v1' }]
  },
  fusion_planner: {
    role: 'fusion_planner',
    hardCapabilities: ['structured_output'],
    preferredCapabilities: ['reasoning', 'json_mode'],
    minimumReliability: 'standard',
    minimumContextTokens: 16_000,
    maximumLatencyClass: 'medium',
    maximumCostClass: 'medium',
    allowedLocalities: ['local', 'remote'],
    allowedPrivacyClasses: ['public', 'private', 'sensitive'],
    requiresCancellation: true,
    toolPermissionClass: 'none',
    structuredOutputStrategy: 'native_schema',
    minimumQualityScore: 0.8,
    fallbackChain: [{ kind: 'deterministic', id: 'fusion_planner_policy_v1' }]
  },
  retriever: {
    role: 'retriever',
    hardCapabilities: ['tool_calling', 'streaming'],
    preferredCapabilities: ['reasoning'],
    minimumReliability: 'standard',
    minimumContextTokens: 16_000,
    maximumLatencyClass: 'medium',
    maximumCostClass: 'medium',
    allowedLocalities: ['local', 'remote'],
    allowedPrivacyClasses: ['public', 'private', 'sensitive'],
    requiresCancellation: true,
    toolPermissionClass: 'approved_retrieval_executor',
    structuredOutputStrategy: 'json_mode_with_validation',
    minimumQualityScore: 0.75,
    fallbackChain: [{ kind: 'no_model', id: 'deterministic_retrieval_executor' }]
  },
  source_quality: {
    role: 'source_quality',
    hardCapabilities: ['structured_output'],
    preferredCapabilities: ['reasoning'],
    minimumReliability: 'standard',
    minimumContextTokens: 16_000,
    maximumLatencyClass: 'medium',
    maximumCostClass: 'medium',
    allowedLocalities: ['local', 'remote'],
    allowedPrivacyClasses: ['public', 'private', 'sensitive'],
    requiresCancellation: true,
    toolPermissionClass: 'none',
    structuredOutputStrategy: 'native_schema',
    minimumQualityScore: 0.8,
    fallbackChain: [{ kind: 'deterministic', id: 'source_quality_policy_v1' }]
  },
  entity_grounding: {
    role: 'entity_grounding',
    hardCapabilities: ['structured_output'],
    preferredCapabilities: ['reasoning'],
    minimumReliability: 'standard',
    minimumContextTokens: 16_000,
    maximumLatencyClass: 'medium',
    maximumCostClass: 'medium',
    allowedLocalities: ['local', 'remote'],
    allowedPrivacyClasses: ['public', 'private', 'sensitive'],
    requiresCancellation: true,
    toolPermissionClass: 'none',
    structuredOutputStrategy: 'native_schema',
    minimumQualityScore: 0.85,
    fallbackChain: [{ kind: 'deterministic', id: 'entity_resolution_policy_v1' }]
  },
  answer_composer: {
    role: 'answer_composer',
    hardCapabilities: ['streaming'],
    preferredCapabilities: ['reasoning'],
    minimumReliability: 'strong',
    minimumContextTokens: 64_000,
    maximumLatencyClass: 'high',
    maximumCostClass: 'high',
    allowedLocalities: ['local', 'remote'],
    allowedPrivacyClasses: ['public', 'private', 'sensitive'],
    requiresCancellation: true,
    toolPermissionClass: 'none',
    structuredOutputStrategy: 'json_mode_with_validation',
    minimumQualityScore: 0.85,
    fallbackChain: [{ kind: 'no_model', id: 'composition_unavailable' }]
  },
  advisor: {
    role: 'advisor',
    hardCapabilities: ['structured_output', 'reasoning'],
    preferredCapabilities: ['json_mode'],
    minimumReliability: 'strong',
    minimumContextTokens: 64_000,
    maximumLatencyClass: 'high',
    maximumCostClass: 'high',
    allowedLocalities: ['local', 'remote'],
    allowedPrivacyClasses: ['public', 'private', 'sensitive'],
    requiresCancellation: true,
    toolPermissionClass: 'none',
    structuredOutputStrategy: 'native_schema',
    minimumQualityScore: 0.85,
    fallbackChain: [{ kind: 'deterministic', id: 'advisor_policy_checks_v1' }],
    preferDifferentFamilyFromRole: 'answer_composer'
  },
  citation_verifier: {
    role: 'citation_verifier',
    hardCapabilities: ['structured_output'],
    preferredCapabilities: ['reasoning'],
    minimumReliability: 'strong',
    minimumContextTokens: 64_000,
    maximumLatencyClass: 'high',
    maximumCostClass: 'high',
    allowedLocalities: ['local', 'remote'],
    allowedPrivacyClasses: ['public', 'private', 'sensitive'],
    requiresCancellation: true,
    toolPermissionClass: 'none',
    structuredOutputStrategy: 'native_schema',
    minimumQualityScore: 0.9,
    fallbackChain: [{ kind: 'deterministic', id: 'citation_policy_checks_v1' }]
  },
  repair: {
    role: 'repair',
    hardCapabilities: ['structured_output'],
    preferredCapabilities: ['reasoning'],
    minimumReliability: 'strong',
    minimumContextTokens: 64_000,
    maximumLatencyClass: 'high',
    maximumCostClass: 'high',
    allowedLocalities: ['local', 'remote'],
    allowedPrivacyClasses: ['public', 'private', 'sensitive'],
    requiresCancellation: true,
    toolPermissionClass: 'none',
    structuredOutputStrategy: 'native_schema',
    minimumQualityScore: 0.9,
    fallbackChain: [{ kind: 'no_model', id: 'repair_unavailable' }]
  }
})
