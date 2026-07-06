import type { CoordinatorEscalation } from './escalation-policy'
import type { CoordinatorPolicyResult } from './policy-types'

export type CoordinatorRepairPlan = {
  canProceedToComposition: boolean
  actions: string[]
  holdReasons: string[]
}

export function createRepairPlan(
  policyResults: CoordinatorPolicyResult[],
  escalation: CoordinatorEscalation
): CoordinatorRepairPlan {
  const holdResults = policyResults.filter(
    result => !result.passed && result.severity === 'block'
  )
  const actions = new Set(policyResults.flatMap(result => result.repairActions))

  if (escalation.requiresAdvisor) actions.add('run_advisor_review')
  if (escalation.requiresCitationVerifier) actions.add('run_citation_verifier')
  if (escalation.requiresStrongerModel) actions.add('select_stronger_model')

  return {
    canProceedToComposition: holdResults.length === 0,
    actions: [...actions],
    holdReasons: holdResults.map(result => result.id)
  }
}
