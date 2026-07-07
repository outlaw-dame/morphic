import { describe, expect, it } from 'vitest'

import type { EvidenceConflict, EvidenceGraph } from '@/lib/ai-architecture/evidence'
import type { RoutePlan } from '@/lib/ai/schemas'

import { evaluateContradictions } from './contradiction-policy'
import { createCoordinatorExecutionState } from './execution-state'

const routePlan: RoutePlan = {
  mode: 'adaptive',
  riskLevel: 'low',
  requiredSourceClasses: [],
  requiredModelRoles: ['router', 'retriever', 'answer_composer'],
  needsFreshness: false,
  needsEntityGrounding: false,
  needsAdvisorReview: false,
  needsCitationVerification: true,
  maxToolCalls: 35,
  rationale: 'test route'
}

function conflict(overrides: Partial<EvidenceConflict> = {}): EvidenceConflict {
  return {
    id: 'conflict_one',
    type: 'negation_overlap',
    severity: 'block',
    evidenceIds: ['ev_one', 'ev_two'],
    claimIds: ['cl_one', 'cl_two'],
    reason: 'Similar claims differ by explicit negation language.',
    ...overrides
  }
}

function graph(conflicts: EvidenceConflict[], warnings: string[] = []): EvidenceGraph {
  return {
    items: [],
    duplicateGroups: [],
    claimClusters: [],
    conflicts,
    claimsByEvidenceId: {},
    warnings
  }
}

describe('evaluateContradictions', () => {
  it('uses structured evidence conflicts without warning strings', () => {
    const result = evaluateContradictions(
      createCoordinatorExecutionState({
        routePlan,
        evidenceGraph: graph([conflict()])
      })
    )

    expect(result.passed).toBe(false)
    expect(result.severity).toBe('block')
    expect(result.details).toHaveLength(1)
    expect(result.details[0]?.id).toBe('conflict_one')
    expect(result.details[0]?.type).toBe('evidence_conflict:negation_overlap')
  })

  it('keeps low-risk numeric conflicts as policy warnings', () => {
    const result = evaluateContradictions(
      createCoordinatorExecutionState({
        routePlan,
        evidenceGraph: graph([
          conflict({
            type: 'numeric_mismatch',
            severity: 'warn',
            reason: 'Similar claims contain different numeric values.'
          })
        ])
      })
    )

    expect(result.passed).toBe(false)
    expect(result.severity).toBe('warn')
    expect(result.details[0]?.type).toBe('evidence_conflict:numeric_mismatch')
  })
})
