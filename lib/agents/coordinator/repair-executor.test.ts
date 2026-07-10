import { describe, expect, it } from 'vitest'

import type { CoordinatorBoundedRepairPlan } from './repair-planner'
import { createAuditedRepairExecutorPlan } from './repair-executor'

function plan(
  overrides: Partial<CoordinatorBoundedRepairPlan> = {}
): CoordinatorBoundedRepairPlan {
  return {
    canAttemptRepair: true,
    remainingRetrievalAttempts: 1,
    steps: [
      {
        id: 'repair_step_1:retrieve_fresh_sources',
        action: 'retrieve_fresh_sources',
        source: 'policy_action',
        priority: 'low',
        reason: 'Retrieve fresh sources.',
        evidenceIds: ['ev_one', 'ev_one', 'ev_two'],
        claimIds: ['cl_one']
      }
    ],
    skippedActions: [],
    blockedReasons: [],
    ...overrides
  }
}

describe('createAuditedRepairExecutorPlan', () => {
  it('returns blocked metadata for a no-op repair plan', () => {
    const result = createAuditedRepairExecutorPlan({
      plan: plan({
        canAttemptRepair: false,
        steps: [],
        blockedReasons: ['no_supported_repair_steps_available']
      })
    })

    expect(result).toEqual({
      canExecute: false,
      retryPolicy: {
        maxAttemptsPerStep: 2,
        baseDelayMs: 1000,
        maxDelayMs: 30000
      },
      records: [],
      blockedReasons: ['no_supported_repair_steps_available']
    })
  })

  it('queues supported repair steps with sanitized audit metadata', () => {
    const result = createAuditedRepairExecutorPlan({
      plan: plan()
    })

    expect(result.canExecute).toBe(true)
    expect(result.blockedReasons).toEqual([])
    expect(result.records).toEqual([
      {
        stepId: 'repair_step_1:retrieve_fresh_sources',
        action: 'retrieve_fresh_sources',
        source: 'policy_action',
        priority: 'low',
        status: 'queued',
        attempt: 1,
        maxAttempts: 2,
        retryDelayMs: null,
        reason: 'Repair step is queued for audited execution.',
        evidenceIds: ['ev_one', 'ev_two'],
        claimIds: ['cl_one']
      }
    ])
  })

  it('adds deterministic exponential retry delay metadata after prior attempts', () => {
    const result = createAuditedRepairExecutorPlan({
      plan: plan(),
      priorAttemptsByStepId: {
        'repair_step_1:retrieve_fresh_sources': 2
      },
      maxAttemptsPerStep: 4,
      baseDelayMs: 500,
      maxDelayMs: 10_000
    })

    expect(result.canExecute).toBe(true)
    expect(result.retryPolicy).toEqual({
      maxAttemptsPerStep: 4,
      baseDelayMs: 500,
      maxDelayMs: 10000
    })
    expect(result.records[0]).toMatchObject({
      status: 'queued',
      attempt: 3,
      maxAttempts: 4,
      retryDelayMs: 1000
    })
  })

  it('skips steps that have exhausted their bounded attempts', () => {
    const result = createAuditedRepairExecutorPlan({
      plan: plan(),
      priorAttemptsByStepId: {
        'repair_step_1:retrieve_fresh_sources': 5
      },
      maxAttemptsPerStep: 2
    })

    expect(result.canExecute).toBe(false)
    expect(result.records[0]).toMatchObject({
      status: 'skipped',
      attempt: 2,
      maxAttempts: 2,
      retryDelayMs: null,
      skipReason: 'max_attempts_exhausted'
    })
    expect(result.blockedReasons).toEqual(['no_supported_repair_steps_available'])
  })

  it('marks completed steps without queuing retries', () => {
    const result = createAuditedRepairExecutorPlan({
      plan: plan(),
      completedStepIds: ['repair_step_1:retrieve_fresh_sources'],
      priorAttemptsByStepId: {
        'repair_step_1:retrieve_fresh_sources': 2
      }
    })

    expect(result.canExecute).toBe(false)
    expect(result.records[0]).toMatchObject({
      status: 'completed',
      attempt: 2,
      retryDelayMs: null,
      skipReason: 'already_completed'
    })
  })

  it('normalizes padded ids before matching and emitting audit metadata', () => {
    const result = createAuditedRepairExecutorPlan({
      plan: plan({
        steps: [
          {
            id: ' repair_step_1:retrieve_fresh_sources ',
            action: ' retrieve_fresh_sources ',
            source: 'policy_action',
            priority: 'low',
            reason: 'Retrieve fresh sources.',
            evidenceIds: [' ev_one ', 'ev_one', ' ', '', 'ev_two'],
            claimIds: [' cl_one ', 'cl_one', '   ']
          }
        ]
      }),
      completedStepIds: [' repair_step_1:retrieve_fresh_sources ']
    })

    expect(result.canExecute).toBe(false)
    expect(result.records[0]).toMatchObject({
      stepId: 'repair_step_1:retrieve_fresh_sources',
      action: 'retrieve_fresh_sources',
      status: 'completed',
      skipReason: 'already_completed',
      evidenceIds: ['ev_one', 'ev_two'],
      claimIds: ['cl_one']
    })
  })

  it('skips malformed or unsupported runtime steps without throwing', () => {
    const result = createAuditedRepairExecutorPlan({
      plan: plan({
        steps: [
          null,
          {
            id: 'unsupported_step',
            action: 'delete_user_data',
            source: 'policy_action',
            priority: 'high',
            reason: 'malicious unsupported action',
            evidenceIds: [],
            claimIds: []
          }
        ] as unknown as CoordinatorBoundedRepairPlan['steps']
      })
    })

    expect(result.canExecute).toBe(false)
    expect(result.records).toEqual([
      expect.objectContaining({
        stepId: 'invalid_step_1',
        action: 'invalid_repair_step',
        status: 'skipped',
        skipReason: 'invalid_step'
      }),
      expect.objectContaining({
        stepId: 'unsupported_step',
        action: 'delete_user_data',
        status: 'skipped',
        skipReason: 'unsupported_repair_action'
      })
    ])
  })

  it('sanitizes malformed runtime source and priority values', () => {
    const result = createAuditedRepairExecutorPlan({
      plan: plan({
        steps: [
          {
            id: 'repair_step_1:run_contradiction_review',
            action: 'run_contradiction_review',
            source: 'malformed_source',
            priority: { malicious: 'high' },
            reason: 'runtime payload with malformed metadata',
            evidenceIds: [],
            claimIds: []
          }
        ] as unknown as CoordinatorBoundedRepairPlan['steps']
      })
    })

    expect(result.canExecute).toBe(true)
    expect(result.records[0]).toMatchObject({
      stepId: 'repair_step_1:run_contradiction_review',
      action: 'run_contradiction_review',
      source: 'policy_action',
      priority: 'low',
      status: 'queued'
    })
  })

  it('clamps adversarial retry policy inputs to deterministic safe bounds', () => {
    const result = createAuditedRepairExecutorPlan({
      plan: plan(),
      priorAttemptsByStepId: {
        'repair_step_1:retrieve_fresh_sources': 99
      },
      maxAttemptsPerStep: 99,
      baseDelayMs: -100,
      maxDelayMs: 999_999_999
    })

    expect(result.retryPolicy).toEqual({
      maxAttemptsPerStep: 5,
      baseDelayMs: 1,
      maxDelayMs: 300000
    })
    expect(result.records[0]).toMatchObject({
      status: 'skipped',
      attempt: 5,
      maxAttempts: 5,
      skipReason: 'max_attempts_exhausted'
    })
  })
})
