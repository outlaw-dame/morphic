import type { ModelRole } from '@/lib/ai/schemas'

import type { RoleSelectionProfile } from './role-selection-v2'

const BASE_PROFILE = {
  minimumReliability: 'standard',
  minimumContextTokens: 8_000,
  maximumLatencyMs: 15_000,
  maximumCostPerMillionTokensUsd: 50,
  allowedLocalities: ['local', 'remote'],
  minimumCapabilityProvenance: 'deployment_configured',
  minimumRoleQualityScore: 0.8,
  maximumQualityAgeDays: 90,
  requiredToolPermissionClass: 'none',
  structuredOutputStrategy: 'native',
  fallbackModelIds: [],
  preferFamilyDiversityFrom: null
} as const

export const ROLE_SELECTION_PROFILES_V2: Readonly<
  Record<ModelRole, RoleSelectionProfile>
> = Object.freeze({
  router: Object.freeze({
    ...BASE_PROFILE,
    role: 'router',
    hardCapabilities: ['structured_output'],
    preferredCapabilities: ['reasoning'],
    minimumContextTokens: 4_000,
    maximumLatencyMs: 3_000,
    maximumCostPerMillionTokensUsd: 15,
    minimumRoleQualityScore: 0.85,
    requiredToolPermissionClass: 'none'
  }),
  coordinator: Object.freeze({
    ...BASE_PROFILE,
    role: 'coordinator',
    hardCapabilities: ['structured_output'],
    preferredCapabilities: ['reasoning'],
    maximumLatencyMs: 8_000,
    minimumRoleQualityScore: 0.9,
    requiredToolPermissionClass: 'none'
  }),
  fusion_planner: Object.freeze({
    ...BASE_PROFILE,
    role: 'fusion_planner',
    hardCapabilities: ['structured_output'],
    preferredCapabilities: ['reasoning'],
    maximumLatencyMs: 8_000,
    minimumRoleQualityScore: 0.85,
    requiredToolPermissionClass: 'retrieval_plan_only'
  }),
  retriever: Object.freeze({
    ...BASE_PROFILE,
    role: 'retriever',
    hardCapabilities: ['tool_calling'],
    preferredCapabilities: ['streaming', 'reasoning'],
    maximumLatencyMs: 30_000,
    maximumCostPerMillionTokensUsd: 30,
    minimumRoleQualityScore: 0.8,
    requiredToolPermissionClass: 'bounded_retrieval',
    structuredOutputStrategy: 'validated_json'
  }),
  source_quality: Object.freeze({
    ...BASE_PROFILE,
    role: 'source_quality',
    hardCapabilities: ['structured_output'],
    preferredCapabilities: ['reasoning'],
    maximumLatencyMs: 8_000,
    minimumRoleQualityScore: 0.9,
    requiredToolPermissionClass: 'none'
  }),
  entity_grounding: Object.freeze({
    ...BASE_PROFILE,
    role: 'entity_grounding',
    hardCapabilities: ['structured_output'],
    preferredCapabilities: ['reasoning'],
    maximumLatencyMs: 10_000,
    minimumRoleQualityScore: 0.9,
    requiredToolPermissionClass: 'entity_resolution_only'
  }),
  answer_composer: Object.freeze({
    ...BASE_PROFILE,
    role: 'answer_composer',
    hardCapabilities: ['streaming'],
    preferredCapabilities: ['reasoning', 'structured_output'],
    minimumContextTokens: 16_000,
    maximumLatencyMs: 20_000,
    minimumRoleQualityScore: 0.88,
    requiredToolPermissionClass: 'none',
    structuredOutputStrategy: 'not_required'
  }),
  advisor: Object.freeze({
    ...BASE_PROFILE,
    role: 'advisor',
    hardCapabilities: ['structured_output'],
    preferredCapabilities: ['reasoning'],
    minimumContextTokens: 16_000,
    maximumLatencyMs: 12_000,
    minimumRoleQualityScore: 0.9,
    requiredToolPermissionClass: 'none'
  }),
  citation_verifier: Object.freeze({
    ...BASE_PROFILE,
    role: 'citation_verifier',
    hardCapabilities: ['structured_output'],
    preferredCapabilities: ['reasoning'],
    minimumContextTokens: 16_000,
    maximumLatencyMs: 15_000,
    minimumRoleQualityScore: 0.92,
    requiredToolPermissionClass: 'evidence_read_only'
  }),
  repair: Object.freeze({
    ...BASE_PROFILE,
    role: 'repair',
    hardCapabilities: ['structured_output'],
    preferredCapabilities: ['reasoning'],
    minimumContextTokens: 16_000,
    maximumLatencyMs: 15_000,
    minimumRoleQualityScore: 0.9,
    requiredToolPermissionClass: 'draft_repair_only'
  })
})

export function getRoleSelectionProfileV2(role: ModelRole): RoleSelectionProfile {
  return ROLE_SELECTION_PROFILES_V2[role]
}
