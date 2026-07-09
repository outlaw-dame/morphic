import { describe, expect, it } from 'vitest'

import type { RoutePlan } from '@/lib/ai/schemas'

import {
  createBoundedRepairPlan,
  type CoordinatorBoundedRepairPlanInput
} from './repair-planner'

const baseRoutePlan: RoutePlan = {
  mode: 'adaptive',
  riskLevel: 'low',
  requiredSourceClasses: [],
  requiredModelRoles: ['router', 'retriever', 'answer_composer'],
  needsFreshness: false,
  needsEntityGrounding: false,
  needsAdvisorReview: false,
  needsCitationVerification: true,
  maxToolCalls: 35,
  rationale: 'repair planner test route'
}

function plan(
  overrides: Partial<CoordinatorBoundedRepairPlanInput> = {}
): ReturnType<typeof createBoundedRepairPlan> {
  return createBoundedRepairPlan({
    routePlan: baseRoutePlan,
    requiredRepairActions: [],
    conflictRepairHints: [],
    ...overrides
  })
}

describe('bounded Coordinator repair planner', () => {
  it('returns no-op blocked metadata when no supported repair steps are available', () => {
    expect(plan()).toEqual({
      canAttemptRepair: false,
      remainingRetrievalAttempts: 2,
      steps: [],
      skippedActions: [],
      blockedReasons: ['no_supported_repair_steps_available']
    })
  })

  it('prioritizes conflict hints before lower-priority policy actions', () => {
    const repairPlan = plan({
      requiredRepairActions: ['retrieve_fresh_sources', 'run_citation_verifier'],
      conflictRepairHints: [
        {
          id: 'contradictions:conflict_one:repair_hint',
          policyId: 'contradictions',
          conflictId: 'conflict_one',
          action: 'retrieve_primary_numeric_source',
          priority: 'high',
          evidenceIds: ['ev_one', 'ev_two'],
          claimIds: ['cl_one'],
          reason: 'Resolve conflicting numeric claims.'
        }
      ]
    })

    expect(repairPlan.canAttemptRepair).toBe(true)
    expect(repairPlan.steps).toEqual([
      {
        id: 'repair_step_1:retrieve_primary_numeric_source',
        action: 'retrieve_primary_numeric_source',
        source: 'conflict_hint',
        priority: 'high',
        reason: 'Resolve conflicting numeric claims.',
        evidenceIds: ['ev_one', 'ev_two'],
        claimIds: ['cl_one']
      },
      {
        id: 'repair_step_2:run_citation_verifier',
        action: 'run_citation_verifier',
        source: 'policy_action',
        priority: 'medium',
        reason: 'Verify citations before final composition.',
        evidenceIds: [],
        claimIds: []
      },
      {
        id: 'repair_step_3:retrieve_fresh_sources',
        action: 'retrieve_fresh_sources',
        source: 'policy_action',
        priority: 'low',
        reason: 'Retrieve fresh sources for the freshness-sensitive route.',
        evidenceIds: [],
        claimIds: []
      }
    ])
    expect(repairPlan.remainingRetrievalAttempts).toBe(0)
    expect(repairPlan.skippedActions).toEqual([])
  })

  it('deduplicates normalized repair actions and reports duplicates', () => {
    const repairPlan = plan({
      requiredRepairActions: [
        'retrieve_authoritative_sources',
        'retrieve_authoritative_sources'
      ],
      conflictRepairHints: [
        {
          id: 'hint_one',
          policyId: 'contradictions',
          action: 'retrieve_authoritative_sources',
          priority: 'high',
          evidenceIds: ['ev_one', 'ev_one'],
          claimIds: ['cl_one', 'cl_one'],
          reason: 'Use authoritative sources.'
        }
      ]
    })

    expect(repairPlan.steps).toEqual([
      {
        id: 'repair_step_1:retrieve_authoritative_sources',
        action: 'retrieve_authoritative_sources',
        source: 'conflict_hint',
        priority: 'high',
        reason: 'Use authoritative sources.',
        evidenceIds: ['ev_one'],
        claimIds: ['cl_one']
      }
    ])
    expect(repairPlan.skippedActions).toEqual([
      {
        action: 'retrieve_authoritative_sources',
        reason: 'duplicate_action',
        source: 'policy_action'
      },
      {
        action: 'retrieve_authoritative_sources',
        reason: 'duplicate_action',
        source: 'policy_action'
      }
    ])
  })

  it('blocks retrieval actions when the retrieval attempt budget is exhausted', () => {
    const repairPlan = plan({
      retrievalAttempts: 2,
      maxRetrievalAttempts: 2,
      requiredRepairActions: ['retrieve_fresh_sources', 'run_advisor_review']
    })

    expect(repairPlan.remainingRetrievalAttempts).toBe(0)
    expect(repairPlan.steps).toEqual([
      {
        id: 'repair_step_1:run_advisor_review',
        action: 'run_advisor_review',
        source: 'policy_action',
        priority: 'high',
        reason: 'Escalate to advisor review before composition.',
        evidenceIds: [],
        claimIds: []
      }
    ])
    expect(repairPlan.skippedActions).toEqual([
      {
        action: 'retrieve_fresh_sources',
        reason: 'retrieval_attempt_budget_exhausted',
        source: 'policy_action'
      }
    ])
  })

  it('normalizes broad retrieval actions for high-risk routes', () => {
    const repairPlan = plan({
      routePlan: {
        ...baseRoutePlan,
        riskLevel: 'high'
      },
      requiredRepairActions: ['retrieve_more_sources', 'retrieve_independent_sources']
    })

    expect(repairPlan.steps).toEqual([
      {
        id: 'repair_step_1:retrieve_authoritative_sources',
        action: 'retrieve_authoritative_sources',
        source: 'policy_action',
        priority: 'low',
        reason: 'Retrieve more sources before composition.',
        evidenceIds: [],
        claimIds: [],
        originalAction: 'retrieve_more_sources'
      },
      {
        id: 'repair_step_2:retrieve_independent_corroboration',
        action: 'retrieve_independent_corroboration',
        source: 'policy_action',
        priority: 'low',
        reason: 'Retrieve independent sources to improve source diversity.',
        evidenceIds: [],
        claimIds: [],
        originalAction: 'retrieve_independent_sources'
      }
    ])
  })

  it('normalizes broad retrieval actions for critical mode even when inferred risk is low', () => {
    const repairPlan = plan({
      routePlan: {
        ...baseRoutePlan,
        mode: 'critical',
        riskLevel: 'low'
      },
      requiredRepairActions: ['retrieve_more_sources', 'retrieve_independent_sources']
    })

    expect(repairPlan.steps.map(step => step.action)).toEqual([
      'retrieve_authoritative_sources',
      'retrieve_independent_corroboration'
    ])
    expect(repairPlan.steps.map(step => step.originalAction)).toEqual([
      'retrieve_more_sources',
      'retrieve_independent_sources'
    ])
  })

  it('skips unsupported actions and enforces a max step limit', () => {
    const repairPlan = plan({
      maxSteps: 2,
      requiredRepairActions: [
        'unsupported_action',
        'run_advisor_review',
        'run_citation_verifier',
        'run_entity_grounding'
      ]
    })

    expect(repairPlan.steps.map(step => step.action)).toEqual([
      'run_advisor_review',
      'run_citation_verifier'
    ])
    expect(repairPlan.skippedActions).toHaveLength(2)
    expect(repairPlan.skippedActions).toEqual(
      expect.arrayContaining([
        {
          action: 'unsupported_action',
          reason: 'unsupported_repair_action',
          source: 'policy_action'
        },
        {
          action: 'run_entity_grounding',
          reason: 'max_steps_reached',
          source: 'policy_action'
        }
      ])
    )
  })

  it('handles invalid numeric bounds without producing negative budgets', () => {
    const repairPlan = plan({
      retrievalAttempts: Number.NaN,
      maxRetrievalAttempts: -2,
      maxSteps: -1,
      requiredRepairActions: ['run_advisor_review']
    })

    expect(repairPlan.remainingRetrievalAttempts).toBe(0)
    expect(repairPlan.steps).toEqual([])
    expect(repairPlan.skippedActions).toEqual([
      {
        action: 'run_advisor_review',
        reason: 'max_steps_reached',
        source: 'policy_action'
      }
    ])
    expect(repairPlan.blockedReasons).toEqual(['no_supported_repair_steps_available'])
  })

  it('decrements the retrieval budget for each planned retrieval step and blocks subsequent retrieval steps when exhausted', () => {
    const repairPlan = plan({
      retrievalAttempts: 1,
      maxRetrievalAttempts: 2,
      requiredRepairActions: [
        'retrieve_authoritative_sources',
        'retrieve_fresh_sources'
      ]
    })

    expect(repairPlan.remainingRetrievalAttempts).toBe(0)
    expect(repairPlan.steps).toEqual([
      {
        id: 'repair_step_1:retrieve_authoritative_sources',
        action: 'retrieve_authoritative_sources',
        source: 'policy_action',
        priority: 'high',
        reason: 'Retrieve authoritative sources before composition.',
        evidenceIds: [],
        claimIds: []
      }
    ])
    expect(repairPlan.skippedActions).toEqual([
      {
        action: 'retrieve_fresh_sources',
        reason: 'retrieval_attempt_budget_exhausted',
        source: 'policy_action'
      }
    ])
  })

  it('ignores malformed runtime arrays and route metadata without throwing', () => {
    const repairPlan = createBoundedRepairPlan({
      routePlan: null,
      requiredRepairActions: [null, 123, ' run_advisor_review '],
      conflictRepairHints: [
        null,
        {
          action: 42,
          priority: 'high',
          reason: 'ignored malformed action',
          evidenceIds: ['ev_one'],
          claimIds: ['cl_one']
        },
        {
          action: 'retrieve_primary_numeric_source',
          priority: 'invalid_priority',
          reason: '',
          evidenceIds: 'ev_two',
          claimIds: { id: 'cl_two' }
        }
      ]
    } as unknown as CoordinatorBoundedRepairPlanInput)

    expect(repairPlan.steps).toEqual([
      {
        id: 'repair_step_1:run_advisor_review',
        action: 'run_advisor_review',
        source: 'policy_action',
        priority: 'high',
        reason: 'Escalate to advisor review before composition.',
        evidenceIds: [],
        claimIds: []
      },
      {
        id: 'repair_step_2:retrieve_primary_numeric_source',
        action: 'retrieve_primary_numeric_source',
        source: 'conflict_hint',
        priority: 'low',
        reason: 'Run the requested deterministic repair action.',
        evidenceIds: [],
        claimIds: []
      }
    ])
    expect(repairPlan.skippedActions).toEqual([])
  })
})
