import type { CoordinatorExecutionState } from './execution-state'
import type { CoordinatorPolicyResult } from './policy-types'

export type CoordinatorEscalation = {
  requiresMoreRetrieval: boolean
  requiresAdvisor: boolean
  requiresCitationVerifier: boolean
  requiresStrongerModel: boolean
  reasons: string[]
}

export function determineEscalation(
  state: CoordinatorExecutionState,
  policyResults: CoordinatorPolicyResult[]
): CoordinatorEscalation {
  const failedResults = policyResults.filter(result => !result.passed)
  const repairActions = new Set(
    failedResults.flatMap(result => result.repairActions)
  )
  const blocked = failedResults.some(result => result.severity === 'block')

  return {
    requiresMoreRetrieval:
      repairActions.has('retrieve_more_sources') ||
      repairActions.has('retrieve_required_source_classes') ||
      repairActions.has('retrieve_authoritative_sources') ||
      repairActions.has('retrieve_independent_sources') ||
      repairActions.has('retrieve_fresh_sources') ||
      repairActions.has('retrieve_disambiguating_sources'),
    requiresAdvisor:
      state.routePlan.needsAdvisorReview ||
      repairActions.has('escalate_to_advisor') ||
      state.routePlan.riskLevel === 'high',
    requiresCitationVerifier: state.routePlan.needsCitationVerification,
    requiresStrongerModel: blocked && state.routePlan.mode !== 'quick',
    reasons: failedResults.map(result => result.reason)
  }
}
