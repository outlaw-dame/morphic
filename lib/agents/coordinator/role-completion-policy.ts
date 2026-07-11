import type { ModelRole } from '@/lib/ai/schemas'

import type { CoordinatorExecutionState } from './execution-state'
import {
  type CoordinatorPolicyResult,
  failPolicy,
  passPolicy
} from './policy-types'

function requiredRolesForStage(state: CoordinatorExecutionState): ModelRole[] {
  if (!state.stage) return []

  const required = new Set<ModelRole>(['router'])

  if (state.routePlan.requiresResearch) required.add('retriever')
  if (state.routePlan.needsFusionPlanning) required.add('fusion_planner')
  if (state.routePlan.needsSourceQuality) required.add('source_quality')
  if (state.routePlan.needsEntityGrounding) required.add('entity_grounding')

  if (state.stage === 'post_composition_pre_release') {
    required.add('answer_composer')
    if (state.routePlan.needsAdvisorReview) required.add('advisor')
    if (state.routePlan.needsCitationVerification) {
      required.add('citation_verifier')
    }
  }

  return [...required].sort()
}

export function evaluateRoleCompletion(
  state: CoordinatorExecutionState
): CoordinatorPolicyResult {
  if (!state.stage) {
    return passPolicy(
      'role_completion',
      'Legacy isolated Coordinator state does not declare an enforcement stage.'
    )
  }

  const completed = new Set(state.completedRoles)
  const missing = requiredRolesForStage(state).filter(role => !completed.has(role))

  if (missing.length > 0) {
    return failPolicy({
      id: 'role_completion',
      severity: 'block',
      reason: `Coordinator stage ${state.stage} is missing required completed roles: ${missing.join(', ')}.`,
      repairActions: missing.map(role => `run_${role}`)
    })
  }

  return passPolicy(
    'role_completion',
    `All required roles are complete for Coordinator stage ${state.stage}.`
  )
}
