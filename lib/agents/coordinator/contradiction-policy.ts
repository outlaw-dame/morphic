import type { CoordinatorExecutionState } from './execution-state'
import {
  type CoordinatorPolicyResult,
  failPolicy,
  passPolicy
} from './policy-types'

const CONTRADICTION_MARKERS = [
  'contradiction',
  'conflict',
  'disputed',
  'refutes',
  'opposes'
]

const CONTRADICTION_PATTERN = new RegExp(
  `\\b(${CONTRADICTION_MARKERS.join('|')})\\b`,
  'i'
)

export function evaluateContradictions(
  state: CoordinatorExecutionState
): CoordinatorPolicyResult {
  const warnings = state.evidenceGraph.warnings.join(' ')
  const hasContradictionWarning = CONTRADICTION_PATTERN.test(warnings)

  if (!hasContradictionWarning) {
    return passPolicy(
      'contradictions',
      'No contradiction warning is present in the evidence graph.'
    )
  }

  return failPolicy({
    id: 'contradictions',
    severity: state.routePlan.riskLevel === 'high' ? 'block' : 'warn',
    reason: 'Evidence graph contains contradiction or dispute warnings.',
    repairActions: ['run_contradiction_review', 'escalate_to_advisor']
  })
}
