import type { EvidenceConflict } from '@/lib/ai-architecture/evidence'

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

function warningHasContradiction(state: CoordinatorExecutionState): boolean {
  const warnings = state.evidenceGraph.warnings.join(' ')
  return CONTRADICTION_PATTERN.test(warnings)
}

function conflictDetails(conflicts: EvidenceConflict[]) {
  return conflicts.map(conflict => ({
    type: `evidence_conflict:${conflict.type}`,
    id: conflict.id,
    severity: conflict.severity,
    evidenceIds: conflict.evidenceIds,
    claimIds: conflict.claimIds,
    reason: conflict.reason
  }))
}

function strongestConflictSeverity(
  conflicts: EvidenceConflict[]
): 'warn' | 'block' | null {
  if (conflicts.some(conflict => conflict.severity === 'block')) return 'block'
  if (conflicts.some(conflict => conflict.severity === 'warn')) return 'warn'
  return null
}

export function evaluateContradictions(
  state: CoordinatorExecutionState
): CoordinatorPolicyResult {
  const conflicts = state.evidenceGraph.conflicts ?? []
  const conflictSeverity = strongestConflictSeverity(conflicts)
  const hasWarningOnlyContradiction =
    conflicts.length === 0 && warningHasContradiction(state)

  if (!conflictSeverity && !hasWarningOnlyContradiction) {
    return passPolicy(
      'contradictions',
      'No contradiction warning is present in the evidence graph.'
    )
  }

  const mustBlock =
    conflictSeverity === 'block' ||
    state.routePlan.riskLevel === 'high' ||
    state.routePlan.riskLevel === 'critical'
  const reason = conflictSeverity
    ? 'Evidence graph contains structured evidence conflicts.'
    : 'Evidence graph contains contradiction or dispute warnings.'

  return failPolicy({
    id: 'contradictions',
    severity: mustBlock ? 'block' : 'warn',
    reason,
    repairActions: ['run_contradiction_review', 'escalate_to_advisor'],
    details: conflictDetails(conflicts)
  })
}
