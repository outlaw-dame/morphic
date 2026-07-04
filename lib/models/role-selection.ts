import type { ModelRole } from '@/lib/ai/schemas'
import type { Model } from '@/lib/types/models'

import {
  getMissingCapabilitiesForRole,
  inferModelCapabilityProfile,
  modelSupportsRole,
  type ModelCapabilityProfile
} from './capabilities'

export type ModelRoleCandidate = {
  model: Model
  profile: ModelCapabilityProfile
}

export type RejectedModelRoleCandidate = {
  model: Model
  profile: ModelCapabilityProfile
  missingCapabilities: ReturnType<typeof getMissingCapabilitiesForRole>
}

export type SelectModelForRoleResult = {
  selected: ModelRoleCandidate | null
  eligible: ModelRoleCandidate[]
  rejected: RejectedModelRoleCandidate[]
}

const RELIABILITY_SCORE: Record<ModelCapabilityProfile['reliability'], number> =
  {
    strong: 0,
    standard: 1,
    experimental: 2,
    unknown: 3
  }

function scoreRoleCandidate(candidate: ModelRoleCandidate): number {
  const capabilityBonus = candidate.profile.capabilities.length / 100
  const reliabilityScore = RELIABILITY_SCORE[candidate.profile.reliability]
  return reliabilityScore - capabilityBonus
}

function sortRoleCandidates(
  candidates: ModelRoleCandidate[]
): ModelRoleCandidate[] {
  return [...candidates].sort((a, b) => {
    const scoreDiff = scoreRoleCandidate(a) - scoreRoleCandidate(b)
    if (scoreDiff !== 0) return scoreDiff

    const providerDiff = a.model.providerId.localeCompare(b.model.providerId)
    if (providerDiff !== 0) return providerDiff

    return a.model.id.localeCompare(b.model.id)
  })
}

export function getModelRoleCandidate(model: Model): ModelRoleCandidate {
  return {
    model,
    profile: inferModelCapabilityProfile(model)
  }
}

export function partitionModelsForRole(
  models: Model[],
  role: ModelRole
): Pick<SelectModelForRoleResult, 'eligible' | 'rejected'> {
  const eligible: ModelRoleCandidate[] = []
  const rejected: RejectedModelRoleCandidate[] = []

  for (const model of models) {
    const candidate = getModelRoleCandidate(model)
    if (modelSupportsRole(model, role)) {
      eligible.push(candidate)
    } else {
      rejected.push({
        ...candidate,
        missingCapabilities: getMissingCapabilitiesForRole(model, role)
      })
    }
  }

  return {
    eligible: sortRoleCandidates(eligible),
    rejected
  }
}

export function selectModelForRole(
  models: Model[],
  role: ModelRole
): SelectModelForRoleResult {
  const { eligible, rejected } = partitionModelsForRole(models, role)

  return {
    selected: eligible[0] ?? null,
    eligible,
    rejected
  }
}
