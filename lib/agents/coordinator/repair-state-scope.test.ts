import { describe, expect, it } from 'vitest'

import {
  applyCoordinatorRepairStateEnvelopeUpdate,
  COORDINATOR_REPAIR_SCOPE_VERSION,
  createCoordinatorRepairStateEnvelope,
  readCoordinatorRepairStateEnvelope
} from './repair-state-scope'

const ownerScopeId = 'owner_scope_0123456789abcdef'
const executionScopeId = 'execution_scope_0123456789abcdef'
const authenticatedScope = {
  ownerScopeId,
  executionScopeId
}

describe('Coordinator repair state scope binding', () => {
  it('creates and reads a versioned envelope for the authenticated scope', () => {
    const created = createCoordinatorRepairStateEnvelope(authenticatedScope, {
      revision: 3,
      completedStepIds: [' step_one '],
      priorAttemptsByStepId: { step_one: 2 },
      evidenceText: 'must-not-persist'
    })

    expect(created).toEqual({
      status: 'created',
      envelope: {
        version: COORDINATOR_REPAIR_SCOPE_VERSION,
        ownerScopeId,
        executionScopeId,
        snapshot: {
          version: 1,
          revision: 3,
          completedStepIds: ['step_one'],
          priorAttemptsByStepId: { step_one: 2 },
          retryPolicy: {
            maxAttemptsPerStep: 2,
            baseDelayMs: 1000,
            maxDelayMs: 30000
          }
        }
      }
    })

    if (created.status !== 'created') throw new Error('Expected envelope creation')

    expect(readCoordinatorRepairStateEnvelope(created.envelope, authenticatedScope)).toEqual({
      status: 'authorized',
      snapshot: created.envelope.snapshot
    })
  })

  it('returns the same denial for malformed envelopes and cross-scope reads', () => {
    const created = createCoordinatorRepairStateEnvelope(authenticatedScope)
    if (created.status !== 'created') throw new Error('Expected envelope creation')

    const denied = {
      status: 'denied',
      reason: 'scope_denied'
    }

    expect(
      readCoordinatorRepairStateEnvelope(created.envelope, {
        ownerScopeId: 'other_owner_scope_0123456789abcdef',
        executionScopeId
      })
    ).toEqual(denied)

    expect(
      readCoordinatorRepairStateEnvelope(created.envelope, {
        ownerScopeId,
        executionScopeId: 'other_execution_scope_0123456789abcdef'
      })
    ).toEqual(denied)

    expect(
      readCoordinatorRepairStateEnvelope(
        {
          ...created.envelope,
          version: 999
        },
        authenticatedScope
      )
    ).toEqual(denied)

    expect(readCoordinatorRepairStateEnvelope(null, authenticatedScope)).toEqual(denied)
  })

  it('rejects weak, oversized, and control-character scope identifiers', () => {
    const denied = {
      status: 'denied',
      reason: 'scope_denied'
    }

    expect(
      createCoordinatorRepairStateEnvelope({
        ownerScopeId: 'short',
        executionScopeId
      })
    ).toEqual(denied)

    expect(
      createCoordinatorRepairStateEnvelope({
        ownerScopeId,
        executionScopeId: `scope_${'x'.repeat(300)}`
      })
    ).toEqual(denied)

    expect(
      createCoordinatorRepairStateEnvelope({
        ownerScopeId: 'owner_scope_012345\n6789abcdef',
        executionScopeId
      })
    ).toEqual(denied)
  })

  it('applies updates only within the bound authenticated scope', () => {
    const created = createCoordinatorRepairStateEnvelope(authenticatedScope, {
      revision: 1,
      completedStepIds: ['step_one'],
      priorAttemptsByStepId: { step_one: 1 }
    })
    if (created.status !== 'created') throw new Error('Expected envelope creation')

    const result = applyCoordinatorRepairStateEnvelopeUpdate(
      created.envelope,
      authenticatedScope,
      {
        expectedRevision: 1,
        completedStepIds: ['step_two'],
        priorAttemptsByStepId: { step_two: 2 }
      }
    )

    expect(result.status).toBe('authorized')
    if (result.status !== 'authorized') throw new Error('Expected authorized update')

    expect(result.update.status).toBe('applied')
    expect(result.envelope).toEqual({
      ...created.envelope,
      snapshot: {
        ...result.update.snapshot,
        completedStepIds: ['step_one', 'step_two'],
        priorAttemptsByStepId: {
          step_one: 1,
          step_two: 2
        }
      }
    })
  })

  it('does not reveal snapshot or revision state to a mismatched scope', () => {
    const created = createCoordinatorRepairStateEnvelope(authenticatedScope, {
      revision: 9,
      completedStepIds: ['secret_step']
    })
    if (created.status !== 'created') throw new Error('Expected envelope creation')

    expect(
      applyCoordinatorRepairStateEnvelopeUpdate(
        created.envelope,
        {
          ownerScopeId: 'other_owner_scope_0123456789abcdef',
          executionScopeId
        },
        {
          expectedRevision: 9,
          completedStepIds: ['attacker_step']
        }
      )
    ).toEqual({
      status: 'denied',
      reason: 'scope_denied'
    })
  })

  it('ignores adversarial scope fields embedded inside snapshot and update payloads', () => {
    const created = createCoordinatorRepairStateEnvelope(authenticatedScope, {
      ownerScopeId: 'attacker_owner_scope_0123456789abcdef',
      executionScopeId: 'attacker_execution_scope_0123456789abcdef',
      revision: 0
    })
    if (created.status !== 'created') throw new Error('Expected envelope creation')

    const result = applyCoordinatorRepairStateEnvelopeUpdate(
      created.envelope,
      authenticatedScope,
      {
        expectedRevision: 0,
        ownerScopeId: 'attacker_owner_scope_0123456789abcdef',
        executionScopeId: 'attacker_execution_scope_0123456789abcdef',
        completedStepIds: ['step_one']
      }
    )

    expect(result.status).toBe('authorized')
    if (result.status !== 'authorized') throw new Error('Expected authorized update')

    expect(result.envelope.ownerScopeId).toBe(ownerScopeId)
    expect(result.envelope.executionScopeId).toBe(executionScopeId)
  })
})
