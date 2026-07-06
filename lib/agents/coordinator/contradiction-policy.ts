import type { CoordinatorExecutionState } from './execution-state'
import { failPolicy, passPolicy, type CoordinatorPolicyResult } from './policy-types'

const CONTRADICTION_MARKERS = [
  'contradiction',
  'conflict',
  'disputed',
  'refutes',
  'opposes'
]

export function evaluateContradictions(
  state: CoordinatorExecutionState
): CoordinatorPolicyResult {
  const warnings = state.evidenceGraph.warnings.join(' ').toLowerCase()
  const hasContradictionWarning = CONTRADICTION_MARKERS.some(marker =>
    warnings.includes(marker)
  )

  if (!hasContradictionWarning) {
    return passPolicy('contradictions', 'No contradiction warning is present in the evidence graph.')
  }

  return failPolicy({
    id: 'contradictions',
    severity: state.routePlan.riskLevel === 'high' ? 'block' : 'warn',
    reason: 'Evidence graph contains contradiction or dispute warnings.',
    repairActions: ['run_contradiction_review', 'escalate_to_advisor']
  })
}
