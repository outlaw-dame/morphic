import type { ModelCapability, ModelRole } from '@/lib/ai/schemas'

import {
  getCapabilityProvenance,
  getRoleQualityScore,
  type RegisteredModel,
  type ReliabilityTier
} from './registry-v2'
import {
  ROLE_FITNESS_PROFILES,
  type RoleFallback,
  type RoleFitnessProfile
} from './role-profiles-v2'

const RELIABILITY_RANK: Record<ReliabilityTier, number> = {
  unknown: 0,
  experimental: 1,
  standard: 2,
  strong: 3
}

const LATENCY_RANK: Record<RegisteredModel['latencyClass'], number> = {
  low: 0,
  medium: 1,
  high: 2,
  unknown: 3
}

const COST_RANK: Record<RegisteredModel['costClass'], number> = {
  free: 0,
  low: 1,
  medium: 2,
  high: 3,
  unknown: 4
}

const TRUSTED_HARD_CAPABILITY_PROVENANCE = new Set([
  'provider_declared',
  'deployment_configured',
  'model_card_declared',
  'evaluation_verified'
])

export type RoleSelectionPrivacyClass =
  RegisteredModel['privacyClasses'][number]

export type RoleSelectionContext = {
  privacyClass: RoleSelectionPrivacyClass
  maximumCostClass?: RegisteredModel['costClass']
  maximumLatencyClass?: RegisteredModel['latencyClass']
  requiredLocality?: RegisteredModel['locality']
  excludedModelIds?: readonly string[]
  selectedFamiliesByRole?: Partial<Record<ModelRole, string>>
  now?: Date
}

export type ModelRoleRejectionReason =
  | 'unavailable'
  | 'disabled'
  | 'deprecated'
  | 'circuit_open'
  | 'permanent_configuration_error'
  | 'privacy_incompatible'
  | 'locality_incompatible'
  | 'latency_incompatible'
  | 'cost_incompatible'
  | 'reliability_below_minimum'
  | 'context_below_minimum'
  | 'cancellation_required'
  | 'missing_verified_hard_capability'
  | 'quality_score_missing'
  | 'quality_score_below_minimum'
  | 'explicitly_excluded'

export type VerifiedRoleCandidate = {
  model: RegisteredModel
  qualityScore: number
  preferredCapabilityCount: number
  diversityPreferred: boolean
}

export type RejectedVerifiedRoleCandidate = {
  model: RegisteredModel
  reasons: readonly ModelRoleRejectionReason[]
  missingHardCapabilities: readonly ModelCapability[]
}

export type VerifiedRoleSelection = {
  role: ModelRole
  selected: VerifiedRoleCandidate | null
  eligible: readonly VerifiedRoleCandidate[]
  rejected: readonly RejectedVerifiedRoleCandidate[]
  fallback: RoleFallback | null
  reasonCodes: readonly string[]
}

function modelHasVerifiedCapability(
  model: RegisteredModel,
  capability: ModelCapability
): boolean {
  return getCapabilityProvenance(model, capability).some(provenance =>
    TRUSTED_HARD_CAPABILITY_PROVENANCE.has(provenance)
  )
}

function isCircuitOpen(model: RegisteredModel, now: Date): boolean {
  if (model.circuitBreaker.permanentConfigurationError) return true
  if (model.circuitBreaker.state !== 'open') return false
  if (!model.circuitBreaker.cooldownUntil) return true
  return new Date(model.circuitBreaker.cooldownUntil).getTime() > now.getTime()
}

function maximumRank(
  roleMaximum: RegisteredModel['latencyClass'],
  requestMaximum?: RegisteredModel['latencyClass']
): number {
  const roleRank = LATENCY_RANK[roleMaximum]
  if (!requestMaximum) return roleRank
  return Math.min(roleRank, LATENCY_RANK[requestMaximum])
}

function maximumCostRank(
  roleMaximum: RegisteredModel['costClass'],
  requestMaximum?: RegisteredModel['costClass']
): number {
  const roleRank = COST_RANK[roleMaximum]
  if (!requestMaximum) return roleRank
  return Math.min(roleRank, COST_RANK[requestMaximum])
}

function evaluateCandidate(
  model: RegisteredModel,
  profile: RoleFitnessProfile,
  context: RoleSelectionContext,
  now: Date
): RejectedVerifiedRoleCandidate | VerifiedRoleCandidate {
  const reasons: ModelRoleRejectionReason[] = []
  const missingHardCapabilities = profile.hardCapabilities.filter(
    capability => !modelHasVerifiedCapability(model, capability)
  )

  if (model.availability === 'unavailable') reasons.push('unavailable')
  if (model.availability === 'disabled') reasons.push('disabled')
  if (model.availability === 'deprecated') reasons.push('deprecated')
  if (model.circuitBreaker.permanentConfigurationError) {
    reasons.push('permanent_configuration_error')
  } else if (isCircuitOpen(model, now)) {
    reasons.push('circuit_open')
  }
  if (!model.privacyClasses.includes(context.privacyClass)) {
    reasons.push('privacy_incompatible')
  }
  if (
    context.requiredLocality &&
    model.locality !== context.requiredLocality
  ) {
    reasons.push('locality_incompatible')
  }
  if (!profile.allowedLocalities.includes(model.locality)) {
    reasons.push('locality_incompatible')
  }
  if (
    LATENCY_RANK[model.latencyClass] >
    maximumRank(profile.maximumLatencyClass, context.maximumLatencyClass)
  ) {
    reasons.push('latency_incompatible')
  }
  if (
    COST_RANK[model.costClass] >
    maximumCostRank(profile.maximumCostClass, context.maximumCostClass)
  ) {
    reasons.push('cost_incompatible')
  }
  if (
    RELIABILITY_RANK[model.reliability] <
    RELIABILITY_RANK[profile.minimumReliability]
  ) {
    reasons.push('reliability_below_minimum')
  }
  if (
    model.maxContextTokens === null ||
    model.maxContextTokens < profile.minimumContextTokens
  ) {
    reasons.push('context_below_minimum')
  }
  if (profile.requiresCancellation && !model.supportsCancellation) {
    reasons.push('cancellation_required')
  }
  if (missingHardCapabilities.length > 0) {
    reasons.push('missing_verified_hard_capability')
  }
  if (context.excludedModelIds?.includes(model.modelId)) {
    reasons.push('explicitly_excluded')
  }

  const roleQuality = getRoleQualityScore(model, profile.role)
  if (!roleQuality) {
    reasons.push('quality_score_missing')
  } else if (roleQuality.score < profile.minimumQualityScore) {
    reasons.push('quality_score_below_minimum')
  }

  if (reasons.length > 0) {
    return {
      model,
      reasons: [...new Set(reasons)],
      missingHardCapabilities
    }
  }

  const comparisonRole = profile.preferDifferentFamilyFromRole
  const comparisonFamily = comparisonRole
    ? context.selectedFamiliesByRole?.[comparisonRole]
    : undefined

  return {
    model,
    qualityScore: roleQuality?.score ?? 0,
    preferredCapabilityCount: profile.preferredCapabilities.filter(capability =>
      modelHasVerifiedCapability(model, capability)
    ).length,
    diversityPreferred: Boolean(
      comparisonFamily && comparisonFamily !== model.modelFamily
    )
  }
}

function sortCandidates(
  candidates: readonly VerifiedRoleCandidate[]
): VerifiedRoleCandidate[] {
  return [...candidates].sort((left, right) => {
    if (left.diversityPreferred !== right.diversityPreferred) {
      return left.diversityPreferred ? -1 : 1
    }
    if (left.qualityScore !== right.qualityScore) {
      return right.qualityScore - left.qualityScore
    }
    if (
      left.preferredCapabilityCount !== right.preferredCapabilityCount
    ) {
      return right.preferredCapabilityCount - left.preferredCapabilityCount
    }
    const reliabilityDifference =
      RELIABILITY_RANK[right.model.reliability] -
      RELIABILITY_RANK[left.model.reliability]
    if (reliabilityDifference !== 0) return reliabilityDifference
    const latencyDifference =
      LATENCY_RANK[left.model.latencyClass] -
      LATENCY_RANK[right.model.latencyClass]
    if (latencyDifference !== 0) return latencyDifference
    const costDifference =
      COST_RANK[left.model.costClass] - COST_RANK[right.model.costClass]
    if (costDifference !== 0) return costDifference
    const providerDifference = left.model.providerId.localeCompare(
      right.model.providerId
    )
    if (providerDifference !== 0) return providerDifference
    return left.model.modelId.localeCompare(right.model.modelId)
  })
}

export function selectVerifiedModelForRole(
  models: readonly RegisteredModel[],
  role: ModelRole,
  context: RoleSelectionContext
): VerifiedRoleSelection {
  const profile = ROLE_FITNESS_PROFILES[role]
  const eligible: VerifiedRoleCandidate[] = []
  const rejected: RejectedVerifiedRoleCandidate[] = []
  const now = context.now ?? new Date()

  for (const model of models) {
    const evaluated = evaluateCandidate(model, profile, context, now)
    if ('reasons' in evaluated) rejected.push(evaluated)
    else eligible.push(evaluated)
  }

  const sortedEligible = sortCandidates(eligible)
  const selected = sortedEligible[0] ?? null
  const fallback = selected ? null : profile.fallbackChain[0] ?? null

  return Object.freeze({
    role,
    selected,
    eligible: Object.freeze(sortedEligible),
    rejected: Object.freeze(rejected),
    fallback,
    reasonCodes: Object.freeze(
      selected
        ? ['verified_model_selected']
        : fallback
          ? [`fallback:${fallback.kind}:${fallback.id}`]
          : ['no_eligible_model_or_fallback']
    )
  })
}
