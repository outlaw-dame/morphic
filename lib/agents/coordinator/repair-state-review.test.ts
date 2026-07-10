import { describe, expect, it } from 'vitest'

import {
  applyCoordinatorRepairStateUpdate,
  createCoordinatorRepairStateSnapshot,
  MAX_REPAIR_STATE_ENTRIES
} from './repair-state'

describe('Coordinator repair state late review regressions', () => {
  it('rejects fractional and unsafe expected revisions', () => {
    const current = createCoordinatorRepairStateSnapshot({
      revision: 3,
      completedStepIds: ['step_one']
    })

    for (const expectedRevision of [3.9, -1, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        applyCoordinatorRepairStateUpdate(current, {
          expectedRevision,
          completedStepIds: ['step_two']
        })
      ).toEqual({
        status: 'conflict',
        reason: 'revision_conflict',
        snapshot: current
      })
    }
  })

  it('prioritizes existing attempt keys before capping adversarial updates', () => {
    const currentIds = Array.from(
      { length: MAX_REPAIR_STATE_ENTRIES },
      (_, index) => `z_current_${index.toString().padStart(2, '0')}`
    )
    const existingLaterKey = currentIds[MAX_REPAIR_STATE_ENTRIES - 1]
    const current = createCoordinatorRepairStateSnapshot({
      revision: 7,
      priorAttemptsByStepId: Object.fromEntries(currentIds.map(id => [id, 1]))
    })
    const lexicallyEarlierNewEntries = Array.from(
      { length: MAX_REPAIR_STATE_ENTRIES },
      (_, index) => [`a_incoming_${index.toString().padStart(2, '0')}`, 5]
    )

    const result = applyCoordinatorRepairStateUpdate(current, {
      expectedRevision: 7,
      priorAttemptsByStepId: Object.fromEntries([
        ...lexicallyEarlierNewEntries,
        [existingLaterKey, 4]
      ])
    })

    expect(result.status).toBe('applied')
    expect(result.snapshot.priorAttemptsByStepId[existingLaterKey]).toBe(4)
    expect(Object.keys(result.snapshot.priorAttemptsByStepId)).toHaveLength(
      MAX_REPAIR_STATE_ENTRIES
    )
    expect(Object.keys(result.snapshot.priorAttemptsByStepId)).not.toContain(
      'a_incoming_00'
    )
  })
})
