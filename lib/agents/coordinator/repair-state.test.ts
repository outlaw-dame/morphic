import { describe, expect, it } from 'vitest'

import {
  applyCoordinatorRepairStateUpdate,
  COORDINATOR_REPAIR_STATE_VERSION,
  createCoordinatorRepairStateSnapshot,
  MAX_REPAIR_STATE_ENTRIES,
  toCoordinatorAdmissionRepairExecutorState
} from './repair-state'

describe('Coordinator repair state contract', () => {
  it('creates a deterministic privacy-safe default snapshot', () => {
    expect(createCoordinatorRepairStateSnapshot()).toEqual({
      version: COORDINATOR_REPAIR_STATE_VERSION,
      revision: 0,
      completedStepIds: [],
      priorAttemptsByStepId: {},
      retryPolicy: {
        maxAttemptsPerStep: 2,
        baseDelayMs: 1000,
        maxDelayMs: 30000
      }
    })
  })

  it('sanitizes persisted runtime values and rejects unsupported versions', () => {
    expect(
      createCoordinatorRepairStateSnapshot({
        version: 1,
        revision: 4.9,
        completedStepIds: [' step_b ', '', 'step_a', 'step_a', 42],
        priorAttemptsByStepId: {
          ' step_b ': 999,
          step_a: 2.8,
          '': 3,
          step_c: -2,
          step_d: Number.POSITIVE_INFINITY
        },
        retryPolicy: {
          maxAttemptsPerStep: 99,
          baseDelayMs: -100,
          maxDelayMs: Number.POSITIVE_INFINITY
        },
        evidenceIds: ['must-not-persist'],
        claimIds: ['must-not-persist'],
        reason: 'must-not-persist'
      })
    ).toEqual({
      version: 1,
      revision: 4,
      completedStepIds: ['step_a', 'step_b'],
      priorAttemptsByStepId: {
        step_a: 2,
        step_b: 5,
        step_c: 0,
        step_d: 0
      },
      retryPolicy: {
        maxAttemptsPerStep: 5,
        baseDelayMs: 1,
        maxDelayMs: 30000
      }
    })

    expect(
      createCoordinatorRepairStateSnapshot({
        version: 999,
        revision: 50,
        completedStepIds: ['untrusted_old_schema']
      })
    ).toEqual(createCoordinatorRepairStateSnapshot())
  })

  it('converts a snapshot into the narrow admission executor state', () => {
    expect(
      toCoordinatorAdmissionRepairExecutorState({
        version: 1,
        revision: 7,
        completedStepIds: [' step_one '],
        priorAttemptsByStepId: { step_one: 2 },
        retryPolicy: {
          maxAttemptsPerStep: 4,
          baseDelayMs: 500,
          maxDelayMs: 5000
        },
        plan: { steps: [] },
        evidenceIds: ['ev_secret']
      })
    ).toEqual({
      completedStepIds: ['step_one'],
      priorAttemptsByStepId: { step_one: 2 },
      maxAttemptsPerStep: 4,
      baseDelayMs: 500,
      maxDelayMs: 5000
    })
  })

  it('applies monotonic completion and attempt updates with revision checks', () => {
    const current = createCoordinatorRepairStateSnapshot({
      revision: 3,
      completedStepIds: ['step_one'],
      priorAttemptsByStepId: {
        step_one: 1,
        step_two: 3
      }
    })

    const result = applyCoordinatorRepairStateUpdate(current, {
      expectedRevision: 3,
      completedStepIds: [' step_two ', 'step_one'],
      priorAttemptsByStepId: {
        step_one: 0,
        step_two: 2,
        step_three: 4
      }
    })

    expect(result).toEqual({
      status: 'applied',
      snapshot: {
        version: 1,
        revision: 4,
        completedStepIds: ['step_one', 'step_two'],
        priorAttemptsByStepId: {
          step_one: 1,
          step_three: 4,
          step_two: 3
        },
        retryPolicy: {
          maxAttemptsPerStep: 2,
          baseDelayMs: 1000,
          maxDelayMs: 30000
        }
      }
    })
  })

  it('returns a no-op without incrementing revision for an idempotent update', () => {
    const current = createCoordinatorRepairStateSnapshot({
      revision: 2,
      completedStepIds: ['step_one'],
      priorAttemptsByStepId: { step_one: 1 }
    })

    expect(
      applyCoordinatorRepairStateUpdate(current, {
        expectedRevision: 2,
        completedStepIds: [' step_one '],
        priorAttemptsByStepId: { step_one: 0 }
      })
    ).toEqual({
      status: 'noop',
      snapshot: current
    })
  })

  it('rejects stale, malformed, and exhausted revisions without mutation', () => {
    const current = createCoordinatorRepairStateSnapshot({
      revision: 5,
      completedStepIds: ['step_one']
    })

    expect(
      applyCoordinatorRepairStateUpdate(current, {
        expectedRevision: 4,
        completedStepIds: ['step_two']
      })
    ).toEqual({
      status: 'conflict',
      reason: 'revision_conflict',
      snapshot: current
    })

    expect(
      applyCoordinatorRepairStateUpdate(current, {
        expectedRevision: '5',
        completedStepIds: ['step_two']
      })
    ).toEqual({
      status: 'conflict',
      reason: 'revision_conflict',
      snapshot: current
    })

    const exhausted = createCoordinatorRepairStateSnapshot({
      revision: Number.MAX_SAFE_INTEGER
    })
    expect(
      applyCoordinatorRepairStateUpdate(exhausted, {
        expectedRevision: Number.MAX_SAFE_INTEGER,
        completedStepIds: ['step_one']
      })
    ).toEqual({
      status: 'conflict',
      reason: 'revision_exhausted',
      snapshot: exhausted
    })
  })

  it('bounds state growth and preserves existing entries under adversarial updates', () => {
    const currentIds = Array.from({ length: MAX_REPAIR_STATE_ENTRIES }, (_, index) =>
      `current_${index.toString().padStart(2, '0')}`
    )
    const current = createCoordinatorRepairStateSnapshot({
      revision: 1,
      completedStepIds: currentIds,
      priorAttemptsByStepId: Object.fromEntries(
        currentIds.map(id => [id, 1])
      )
    })

    const result = applyCoordinatorRepairStateUpdate(current, {
      expectedRevision: 1,
      completedStepIds: Array.from(
        { length: MAX_REPAIR_STATE_ENTRIES * 2 },
        (_, index) => `incoming_${index}`
      ),
      priorAttemptsByStepId: Object.fromEntries([
        ['current_00', 4],
        ...Array.from(
          { length: MAX_REPAIR_STATE_ENTRIES * 2 },
          (_, index) => [`incoming_${index}`, 5]
        )
      ])
    })

    expect(result.status).toBe('applied')
    expect(result.snapshot.completedStepIds).toHaveLength(MAX_REPAIR_STATE_ENTRIES)
    expect(result.snapshot.completedStepIds).toEqual(currentIds)
    expect(Object.keys(result.snapshot.priorAttemptsByStepId)).toHaveLength(
      MAX_REPAIR_STATE_ENTRIES
    )
    expect(result.snapshot.priorAttemptsByStepId.current_00).toBe(4)
    expect(Object.keys(result.snapshot.priorAttemptsByStepId)).not.toContain(
      'incoming_0'
    )
  })

  it('drops oversized identifiers instead of truncating them into collisions', () => {
    const oversizedId = 'x'.repeat(257)
    const snapshot = createCoordinatorRepairStateSnapshot({
      completedStepIds: [oversizedId, 'valid_step'],
      priorAttemptsByStepId: {
        [oversizedId]: 3,
        valid_step: 2
      }
    })

    expect(snapshot.completedStepIds).toEqual(['valid_step'])
    expect(snapshot.priorAttemptsByStepId).toEqual({ valid_step: 2 })
  })
})
