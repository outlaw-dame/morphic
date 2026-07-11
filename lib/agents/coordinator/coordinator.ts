import {
  type CoordinatorDecision,
  CoordinatorDecisionSchema
} from '@/lib/ai/schemas'

import { evaluateContradictions } from './contradiction-policy'
import { evaluateEntityGrounding } from './entity-grounding-policy'
import { determineEscalation } from './escalation-policy'
import type { CoordinatorExecutionState } from './execution-state'
import { evaluateFreshness } from './freshness-policy'
import type { CoordinatorPolicyResult } from './policy-types'
import {
  type CoordinatorRepairPlan,
  createRepairPlan
} from './repair-policy'
import { evaluateRoleCompletion } from './role-completion-policy'
import { evaluateSourceMix } from './source-mix-policy'

export type CoordinatorEvaluation = {
  decision: CoordinatorDecision
  policyResults: CoordinatorPolicyResult[]
  repairPlan: CoordinatorRepairPlan
}

export function coordinateExecution(
  state: CoordinatorExecutionState,
  now = new Date()
): CoordinatorEvaluation {
  const policyResults = [
    evaluateRoleCompletion(state),
    evaluateSourceMix(state),
    evaluateEntityGrounding(state),
    evaluateFreshness(state, now),
    evaluateContradictions(state)
  ]
  const escalation = determineEscalation(state, policyResults)
  const repairPlan = createRepairPlan(policyResults, escalation)
  const retrievalPaths = repairPlan.actions.filter(action =>
    action.startsWith('retrieve_')
  )
  const activeModelRoles = [
    ...state.completedRoles,
    ...(escalation.requiresAdvisor ? ['advisor'] : []),
    ...(escalation.requiresCitationVerifier ? ['citation_verifier'] : [])
  ]

  const decision = CoordinatorDecisionSchema.parse({
    routePlan: state.routePlan,
    activeModelRoles: [...new Set(activeModelRoles)],
    retrievalPaths,
    parallelizable: retrievalPaths.length > 1,
    stopConditions: repairPlan.canProceedToComposition
      ? ['composition_allowed']
      : ['composition_waiting_for_repairs'],
    escalationReasons: escalation.reasons
  })

  return {
    decision,
    policyResults,
    repairPlan
  }
}
