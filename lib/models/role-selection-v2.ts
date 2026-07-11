import type { ModelCapability, ModelRole } from '@/lib/ai/schemas'

export type CapabilityProvenance =
  | 'evaluation_verified'
  | 'deployment_configured'
  | 'model_card_declared'
  | 'provider_declared'
  | 'inferred'
  | 'unknown'

export type ModelAvailability =
  | 'available'
  | 'disabled'
  | 'deprecated'
  | 'unavailable'

export type ModelLocality = 'local' | 'remote'
export type ReliabilityTier = 'unknown' | 'experimental' | 'standard' | 'strong'

export type CapabilityAssertion = Readonly<{
  capability: ModelCapability
  provenance: CapabilityProvenance
}>

export type RoleQualityScore = Readonly<{
  role: ModelRole
  score: number
  fixtureVersion: string
  verifiedAt: string
}>

export type RoleModelCandidate = Readonly<{
  providerId: string
  modelId: string
  family: string
  availability: ModelAvailability
  locality: ModelLocality
  reliability: ReliabilityTier
  maxContextTokens: number
  estimatedLatencyMs: number
  estimatedCostPerMillionTokensUsd: number
  capabilities: readonly CapabilityAssertion[]
  roleQuality: readonly RoleQualityScore[]
  cooldownUntil?: string | null
}>

export type RoleSelectionProfile = Readonly<{
  role: ModelRole
  hardCapabilities: readonly ModelCapability[]
  preferredCapabilities: readonly ModelCapability[]
  minimumReliability: ReliabilityTier
  minimumContextTokens: number
  maximumLatencyMs: number
  maximumCostPerMillionTokensUsd: number
  allowedLocalities: readonly ModelLocality[]
  minimumCapabilityProvenance: CapabilityProvenance
  minimumRoleQualityScore: number
  requiredToolPermissionClass: string
  structuredOutputStrategy: 'native' | 'validated_json' | 'not_required'
  fallbackModelIds: readonly string[]
  preferFamilyDiversityFrom?: string | null
}>

export type RoleSelectionDecision =
  | Readonly<{
      status: 'selected'
      role: ModelRole
      candidate: RoleModelCandidate
      reasonCodes: readonly string[]
    }>
  | Readonly<{
      status: 'deterministic_fallback' | 'no_eligible_model'
      role: ModelRole
      candidate: null
      reasonCodes: readonly string[]
    }>

const PROVENANCE_RANK: Record<CapabilityProvenance, number> = {
  unknown: 0,
  inferred: 1,
  provider_declared: 2,
  model_card_declared: 3,
  deployment_configured: 4,
  evaluation_verified: 5
}

const RELIABILITY_RANK: Record<ReliabilityTier, number> = {
  unknown: 0,
  experimental: 1,
  standard: 2,
  strong: 3
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function isCandidateStructurallyValid(candidate: RoleModelCandidate): boolean {
  return (
    candidate.providerId.length > 0 &&
    candidate.modelId.length > 0 &&
    candidate.family.length > 0 &&
    Number.isSafeInteger(candidate.maxContextTokens) &&
    candidate.maxContextTokens > 0 &&
    isFiniteNonNegative(candidate.estimatedLatencyMs) &&
    isFiniteNonNegative(candidate.estimatedCostPerMillionTokensUsd)
  )
}

function strongestCapabilityProvenance(
  candidate: RoleModelCandidate,
  capability: ModelCapability
): CapabilityProvenance | null {
  let strongest: CapabilityProvenance | null = null
  for (const assertion of candidate.capabilities) {
    if (assertion.capability !== capability) continue
    if (
      strongest === null ||
      PROVENANCE_RANK[assertion.provenance] > PROVENANCE_RANK[strongest]
    ) {
      strongest = assertion.provenance
    }
  }
  return strongest
}

function roleQualityScore(
  candidate: RoleModelCandidate,
  role: ModelRole
): number | null {
  let score: number | null = null
  for (const quality of candidate.roleQuality) {
    if (quality.role !== role) continue
    if (!Number.isFinite(quality.score) || quality.score < 0 || quality.score > 1) {
      continue
    }
    score = score === null ? quality.score : Math.max(score, quality.score)
  }
  return score
}

function isCooldownActive(candidate: RoleModelCandidate, now: Date): boolean {
  if (!candidate.cooldownUntil) return false
  const timestamp = Date.parse(candidate.cooldownUntil)
  return Number.isFinite(timestamp) && timestamp > now.getTime()
}

function evaluateCandidate(
  candidate: RoleModelCandidate,
  profile: RoleSelectionProfile,
  now: Date
): readonly string[] {
  const reasons: string[] = []

  if (!isCandidateStructurallyValid(candidate)) reasons.push('invalid_candidate')
  if (candidate.availability !== 'available') reasons.push(`availability_${candidate.availability}`)
  if (isCooldownActive(candidate, now)) reasons.push('cooldown_active')
  if (!profile.allowedLocalities.includes(candidate.locality)) reasons.push('locality_not_allowed')
  if (
    RELIABILITY_RANK[candidate.reliability] <
    RELIABILITY_RANK[profile.minimumReliability]
  ) {
    reasons.push('reliability_below_minimum')
  }
  if (candidate.maxContextTokens < profile.minimumContextTokens) {
    reasons.push('context_below_minimum')
  }
  if (candidate.estimatedLatencyMs > profile.maximumLatencyMs) {
    reasons.push('latency_above_maximum')
  }
  if (
    candidate.estimatedCostPerMillionTokensUsd >
    profile.maximumCostPerMillionTokensUsd
  ) {
    reasons.push('cost_above_maximum')
  }

  for (const capability of profile.hardCapabilities) {
    const provenance = strongestCapabilityProvenance(candidate, capability)
    if (provenance === null) {
      reasons.push(`missing_capability:${capability}`)
      continue
    }
    if (
      PROVENANCE_RANK[provenance] <
      PROVENANCE_RANK[profile.minimumCapabilityProvenance]
    ) {
      reasons.push(`capability_provenance_too_weak:${capability}`)
    }
  }

  const quality = roleQualityScore(candidate, profile.role)
  if (quality === null) reasons.push('missing_verified_role_quality')
  else if (quality < profile.minimumRoleQualityScore) {
    reasons.push('role_quality_below_minimum')
  }

  return reasons
}

function preferredCapabilityCount(
  candidate: RoleModelCandidate,
  profile: RoleSelectionProfile
): number {
  return profile.preferredCapabilities.filter(
    capability => strongestCapabilityProvenance(candidate, capability) !== null
  ).length
}

function fallbackRank(
  candidate: RoleModelCandidate,
  profile: RoleSelectionProfile
): number {
  const index = profile.fallbackModelIds.indexOf(candidate.modelId)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function compareEligibleCandidates(
  left: RoleModelCandidate,
  right: RoleModelCandidate,
  profile: RoleSelectionProfile
): number {
  const leftFallback = fallbackRank(left, profile)
  const rightFallback = fallbackRank(right, profile)
  if (leftFallback !== rightFallback) return leftFallback - rightFallback

  const diversityFamily = profile.preferFamilyDiversityFrom
  if (diversityFamily) {
    const leftDiverse = left.family !== diversityFamily
    const rightDiverse = right.family !== diversityFamily
    if (leftDiverse !== rightDiverse) return leftDiverse ? -1 : 1
  }

  const leftQuality = roleQualityScore(left, profile.role) ?? -1
  const rightQuality = roleQualityScore(right, profile.role) ?? -1
  if (leftQuality !== rightQuality) return rightQuality - leftQuality

  const preferredDifference =
    preferredCapabilityCount(right, profile) -
    preferredCapabilityCount(left, profile)
  if (preferredDifference !== 0) return preferredDifference

  if (left.reliability !== right.reliability) {
    return RELIABILITY_RANK[right.reliability] - RELIABILITY_RANK[left.reliability]
  }
  if (left.estimatedLatencyMs !== right.estimatedLatencyMs) {
    return left.estimatedLatencyMs - right.estimatedLatencyMs
  }
  if (
    left.estimatedCostPerMillionTokensUsd !==
    right.estimatedCostPerMillionTokensUsd
  ) {
    return (
      left.estimatedCostPerMillionTokensUsd -
      right.estimatedCostPerMillionTokensUsd
    )
  }

  return `${left.providerId}/${left.modelId}`.localeCompare(
    `${right.providerId}/${right.modelId}`
  )
}

export function selectModelForRoleV2(
  candidates: readonly RoleModelCandidate[],
  profile: RoleSelectionProfile,
  options: Readonly<{
    now?: Date
    deterministicFallbackAvailable?: boolean
  }> = {}
): RoleSelectionDecision {
  const now = options.now ?? new Date()
  const eligible = candidates.filter(
    candidate => evaluateCandidate(candidate, profile, now).length === 0
  )

  if (eligible.length === 0) {
    return Object.freeze({
      status: options.deterministicFallbackAvailable
        ? 'deterministic_fallback'
        : 'no_eligible_model',
      role: profile.role,
      candidate: null,
      reasonCodes: Object.freeze(['no_eligible_model'])
    })
  }

  const selected = [...eligible].sort((left, right) =>
    compareEligibleCandidates(left, right, profile)
  )[0]

  return Object.freeze({
    status: 'selected',
    role: profile.role,
    candidate: selected,
    reasonCodes: Object.freeze([
      'hard_requirements_satisfied',
      'quality_threshold_satisfied',
      'deterministic_ranking_applied'
    ])
  })
}

export function getRoleSelectionRejectionReasons(
  candidate: RoleModelCandidate,
  profile: RoleSelectionProfile,
  now = new Date()
): readonly string[] {
  return Object.freeze([...evaluateCandidate(candidate, profile, now)])
}
