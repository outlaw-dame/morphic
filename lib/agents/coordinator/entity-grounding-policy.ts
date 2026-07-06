import type { CoordinatorExecutionState } from './execution-state'
import { failPolicy, passPolicy, type CoordinatorPolicyResult } from './policy-types'

export function evaluateEntityGrounding(
  state: CoordinatorExecutionState
): CoordinatorPolicyResult {
  if (!state.routePlan.needsEntityGrounding) {
    return passPolicy('entity_grounding', 'Route does not require entity grounding.')
  }

  const groundedItems = state.evidenceGraph.items.filter(
    item => item.entities.length > 0 && !item.duplicateOf && !item.copiedFrom
  )

  if (groundedItems.length === 0) {
    return failPolicy({
      id: 'entity_grounding',
      severity: 'block',
      reason: 'Route requires entity grounding but usable evidence has no resolved entities.',
      repairActions: ['run_entity_grounding']
    })
  }

  const ambiguousEntities = groundedItems.flatMap(item =>
    item.entities.filter(entity => entity.ambiguous)
  )
  if (ambiguousEntities.length > 0) {
    return failPolicy({
      id: 'entity_grounding',
      severity: 'warn',
      reason: 'Some grounded entities are ambiguous and should be disambiguated before final composition.',
      repairActions: ['retrieve_disambiguating_sources']
    })
  }

  return passPolicy('entity_grounding', 'Required entity grounding is present.')
}
