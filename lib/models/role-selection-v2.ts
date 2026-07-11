import {
  ModelCapabilitySchema,
  ModelRoleSchema,
  type ModelCapability,
  type ModelRole
} from '@/lib/ai/schemas'

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
  maximumQualityAgeDays: number
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

const CAPABILITY_VALUES = new Set<string>(ModelCapabilitySchema.options)
const ROLE_VALUES = new Set<string>(ModelRoleSchema.options)
const CAPABILITY_PROVENANCE_VALUES = new Set<CapabilityProvenance>([
  'evaluation_verified',
  'deployment_configured',
  'model_card_declared',
  'provider_declared',
  'inferred',
  'unknown'
])
const AVAILABILITY_VALUES = new Set<ModelAvailability>([
  'available',
  'disabled',
  'deprecated',
  'unavailable'
])
const LOCALITY_VALUES = new Set<ModelLocality>(['local', 'remote'])
const RELIABILITY_VALUES = new Set<ReliabilityTier>([
  'unknown',
  'experimental',
  'standard',
  'strong'
])
const STRUCTURED_OUTPUT_STRATEGIES = new Set([
  'native',
  'validated_json',
  'not_required'
])

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isCapability(value: unknown): value is ModelCapability {
  return typeof value === 'string' && CAPABILITY_VALUES.has(value)
}

function isRole(value: unknown): value is ModelRole {
  return typeof value === 'string' && ROLE_VALUES.has(value)
}

function isCapabilityAssertion(value: unknown): value is CapabilityAssertion {
  if (!isRecord(value)) return false
  return (
    isCapability(value.capability) &&
    typeof value.provenance === 'string' &&
    CAPABILITY_PROVENANCE_VALUES.has(value.provenance as CapabilityProvenance)
  )
}

function isRoleQualityScore(value: unknown): value is RoleQualityScore {
  if (!isRecord(value)) return false
  return (
    isRole(value.role) &&
    typeof value.score === 'number' &&
    Number.isFinite(value.score) &&
    value.score >= 0 &&
    value.score <= 1 &&
    isNonEmptyString(value.fixtureVersion) &&
    isIsoDate(value.verifiedAt)
  )
}

function isCandidateStructurallyValid(
  value: unknown
): value is RoleModelCandidate {
  if (!isRecord(value)) return false

  return (
    isNonEmptyString(value.providerId) &&
    isNonEmptyString(value.modelId) &&
    isNonEmptyString(value.family) &&
    typeof value.availability === 'string' &&
    AVAILABILITY_VALUES.has(value.availability as ModelAvailability) &&
    typeof value.locality === 'string' &&
    LOCALITY_VALUES.has(value.locality as ModelLocality) &&
    typeof value.reliability === 'string' &&
    RELIABILITY_VALUES.has(value.reliability as ReliabilityTier) &&
    Number.isSafeInteger(value.maxContextTokens) &&
    (value.maxContextTokens as number) > 0 &&
    isFiniteNonNegative(value.estimatedLatencyMs) &&
    isFiniteNonNegative(value.estimatedCostPerMillionTokensUsd) &&
    Array.isArray(value.capabilities) &&
    value.capabilities.every(isCapabilityAssertion) &&
    Array.isArray(value.roleQuality) &&
    value.roleQuality.every(isRoleQualityScore) &&
    (value.cooldownUntil === undefined ||
      value.cooldownUntil === null ||
      isIsoDate(value.cooldownUntil))
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
  role: ModelRole,
  now: Date,
  maximumAgeDays: number
): number | null {
  let score: number | null = null
  const minimumVerifiedAt = now.getTime() - maximumAgeDays * 24 * 60 * 60 * 1000

  for (const quality of candidate.roleQuality) {
    if (quality.role !== role) continue
    const verifiedAt = Date.parse(quality.verifiedAt)
    if (!Number.isFinite(verifiedAt) || verifiedAt < minimumVerifiedAt) continue
    score = score === null ? quality.score : Math.max(score, quality.score)
  }
  return score
}

function isCooldownActive(candidate: RoleModelCandidate, now: Date): boolean {
  if (!candidate.cooldownUntil) return false
  return Date.parse(candidate.cooldownUntil) > now.getTime()
}

function isProfileStructurallyValid(profile: RoleSelectionProfile): boolean {
  return (
    isRole(profile.role) &&
    Array.isArray(profile.hardCapabilities) &&
    profile.hardCapabilities.every(isCapability) &&
    Array.isArray(profile.preferredCapabilities) &&
    profile.preferredCapabilities.every(isCapability) &&
    RELIABILITY_VALUES.has(profile.minimumReliability) &&
    Number.isSafeInteger(profile.minimumContextTokens) &&
    profile.minimumContextTokens > 0 &&
    isFiniteNonNegative(profile.maximumLatencyMs) &&
    isFiniteNonNegative(profile.maximumCostPerMillionTokensUsd) &&
    Array.isArray(profile.allowedLocalities) &&
    profile.allowedLocalities.length > 0 &&
    profile.allowedLocalities.every(locality =>
      LOCALITY_VALUES.has(locality)
    ) &&
    CAPABILITY_PROVENANCE_VALUES.has(profile.minimumCapabilityProvenance) &&
    Number.isFinite(profile.minimumRoleQualityScore) &&
    profile.minimumRoleQualityScore >= 0 &&
    profile.minimumRoleQualityScore <= 1 &&
    Number.isSafeInteger(profile.maximumQualityAgeDays) &&
    profile.maximumQualityAgeDays > 0 &&
    isNonEmptyString(profile.requiredToolPermissionClass) &&
    STRUCTURED_OUTPUT_STRATEGIES.has(profile.structuredOutputStrategy) &&
    Array.isArray(profile.fallbackModelIds) &&
    profile.fallbackModelIds.every(isNonEmptyString) &&
    (profile.preferFamilyDiversityFrom === undefined ||
      profile.preferFamilyDiversityFrom === null ||
      isNonEmptyString(profile.preferFamilyDiversityFrom))
  )
}

function evaluateCandidate(
  value: unknown,
  profile: RoleSelectionProfile,
  now: Date
): readonly string[] {
  if (!isCandidateStructurallyValid(value)) return ['invalid_candidate']
  if (!isProfileStructurallyValid(profile)) return ['invalid_selection_profile']
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return ['invalid_selection_time']
  }

  const candidate = value
  const reasons: string[] = []

  if (candidate.availability !== 'available') {
    reasons.push(`availability_${candidate.availability}`)
  }
  if (isCooldownActive(candidate, now)) reasons.push('cooldown_active')
  if (!profile.allowedLocalities.includes(candidate.locality)) {
    reasons.push('locality_not_allowed')
  }
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

  const quality = roleQualityScore(
    candidate,
    profile.role,
    now,
    profile.maximumQualityAgeDays
  )
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
  const qualifiedId = `${candidate.providerId}/${candidate.modelId}`
  const qualifiedIndex = profile.fallbackModelIds.indexOf(qualifiedId)
  if (qualifiedIndex !== -1) return qualifiedIndex
  const modelIndex = profile.fallbackModelIds.indexOf(candidate.modelId)
  return modelIndex === -1 ? Number.MAX_SAFE_INTEGER : modelIndex
}

function compareEligibleCandidates(
  left: RoleModelCandidate,
  right: RoleModelCandidate,
  profile: RoleSelectionProfile,
  now: Date
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

  const leftQuality =
    roleQualityScore(left, profile.role, now, profile.maximumQualityAgeDays) ??
    -1
  const rightQuality =
    roleQualityScore(right, profile.role, now, profile.maximumQualityAgeDays) ??
    -1
  if (leftQuality !== rightQuality) return rightQuality - leftQuality

  const preferredDifference =
    preferredCapabilityCount(right, profile) -
    preferredCapabilityCount(left, profile)
  if (preferredDifference !== 0) return preferredDifference

  if (left.reliability !== right.reliability) {
    return (
      RELIABILITY_RANK[right.reliability] - RELIABILITY_RANK[left.reliability]
    )
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
  candidates: readonly unknown[],
  profile: RoleSelectionProfile,
  options: Readonly<{
    now?: Date
    deterministicFallbackAvailable?: boolean
  }> = {}
): RoleSelectionDecision {
  const now = options.now ?? new Date()
  const eligible = candidates.filter(
    (candidate): candidate is RoleModelCandidate =>
      evaluateCandidate(candidate, profile, now).length === 0
  )

  if (eligible.length === 0) {
    return Object.freeze({
      status: options.deterministicFallbackAvailable
        ? 'deterministic_fallback'
        : 'no_eligible_model',
      role: profile.role,
      candidate: null,
      reasonCodes: Object.freeze([
        options.deterministicFallbackAvailable
          ? 'deterministic_fallback_selected'
          : 'no_eligible_model'
      ])
    })
  }

  const selected = [...eligible].sort((left, right) =>
    compareEligibleCandidates(left, right, profile, now)
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
  candidate: unknown,
  profile: RoleSelectionProfile,
  now = new Date()
): readonly string[] {
  return Object.freeze([...evaluateCandidate(candidate, profile, now)])
}
