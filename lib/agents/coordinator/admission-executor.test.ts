import { describe, expect, it } from 'vitest'

import type {
  EvidenceConflict,
  EvidenceGraph,
  NormalizedEvidenceItem
} from '@/lib/ai-architecture/evidence'
import type { RoutePlan } from '@/lib/ai/schemas'

import {
  createCoordinatorAdmission,
  type CoordinatorAdmissionInput
} from './admission'

const now = new Date('2026-07-06T00:00:00.000Z')
const retrievedAt = '2026-07-05T12:00:00.000Z'

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
  rationale: 'admission executor metadata test route'
}

function evidenceItem(
  overrides: Partial<NormalizedEvidenceItem> = {}
): NormalizedEvidenceItem {
  return {
    id: 'ev_one',
    url: 'https://example.com/report',
    title: 'Example report',
    sourceClass: 'established_news',
    evidenceRole: 'original_reporting',
    claimIds: ['cl_one'],
    quotedText: null,
    summary: 'Praia is the capital of Cape Verde.',
    retrievalPath: 'search',
    publishedAt: retrievedAt,
    retrievedAt,
    confidence: 0.72,
    canonicalUrl: 'https://example.com/report',
    host: 'example.com',
    originalUrl: 'https://example.com/report',
    sourceQuality: {
      sourceClass: 'established_news',
      evidenceRole: 'original_reporting',
      sourceClassScore: 0.76,
      topicalAuthorityScore: 0.74,
      transparencyScore: 0.5,
      originalityScore: 0.62,
      freshnessScore: 0.88,
      corroborationScore: 0.45,
      conflictOfInterestPenalty: 0,
      spamOrContentFarmPenalty: 0,
      userPreferenceModifier: 0,
      finalWeight: 0.72,
      influenceCap: 0.78,
      requiresCorroboration: false,
      allowedClaimTypes: [],
      disallowedClaimTypes: []
    },
    entities: [],
    ...overrides
  }
}

function evidenceConflict(
  overrides: Partial<EvidenceConflict> = {}
): EvidenceConflict {
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

function evidenceGraph(
  items: NormalizedEvidenceItem[],
  conflicts: EvidenceConflict[] = []
): EvidenceGraph {
  return {
    items,
    duplicateGroups: [],
    claimClusters: [],
    conflicts,
    claimsByEvidenceId: {},
    warnings: []
  }
}

function repairAdmissionInput(): CoordinatorAdmissionInput {
  return {
    routePlan: baseRoutePlan,
    evidenceGraph: evidenceGraph(
      [
        evidenceItem(),
        evidenceItem({
          id: 'ev_two',
          url: 'https://other.example.net/report',
          canonicalUrl: 'https://other.example.net/report',
          host: 'other.example.net',
          claimIds: ['cl_two']
        })
      ],
      [evidenceConflict()]
    ),
    completedRoles: ['router', 'retriever'],
    now
  }
}

describe('coordinator admission repair executor metadata', () => {
  it('exposes blocked no-op executor metadata for compose admissions', () => {
    const admission = createCoordinatorAdmission({
      routePlan: baseRoutePlan,
      evidenceGraph: evidenceGraph([evidenceItem()]),
      completedRoles: ['router', 'retriever'],
      now
    })

    expect(admission.status).toBe('compose')
    expect(admission.boundedRepairPlan.steps).toEqual([])
    expect(admission.repairExecutorPlan).toEqual({
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

  it('queues bounded repair steps as audited executor records without running them', () => {
    const admission = createCoordinatorAdmission(repairAdmissionInput())

    expect(admission.status).toBe('repair')
    expect(admission.repairExecutorPlan.canExecute).toBe(true)
    expect(admission.repairExecutorPlan.blockedReasons).toEqual([])
    expect(admission.repairExecutorPlan.records).toEqual(
      admission.boundedRepairPlan.steps.map(step => ({
        stepId: step.id,
        action: step.action,
        source: step.source,
        priority: step.priority,
        status: 'queued',
        attempt: 1,
        maxAttempts: 2,
        retryDelayMs: null,
        reason: 'Repair step is queued for audited execution.',
        evidenceIds: step.evidenceIds,
        claimIds: step.claimIds
      }))
    )
    expect(admission.repairExecutorPlan.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'retrieve_independent_corroboration',
          source: 'conflict_hint',
          evidenceIds: ['ev_one', 'ev_two'],
          claimIds: ['cl_one', 'cl_two']
        }),
        expect.objectContaining({
          action: 'run_contradiction_review',
          source: 'policy_action'
        })
      ])
    )
  })

  it('does not queue retrieval records when retrieval repair budget is exhausted', () => {
    const admission = createCoordinatorAdmission({
      ...repairAdmissionInput(),
      retrievalAttempts: 2,
      maxRetrievalAttempts: 2
    })

    const queuedActions = admission.repairExecutorPlan.records
      .filter(record => record.status === 'queued')
      .map(record => record.action)

    expect(admission.boundedRepairPlan.steps.map(step => step.action)).not.toContain(
      'retrieve_independent_corroboration'
    )
    expect(queuedActions).not.toContain('retrieve_independent_corroboration')
    expect(queuedActions).toContain('run_contradiction_review')
  })

  it('marks caller-reported completed repair steps without re-queuing them', () => {
    const initial = createCoordinatorAdmission(repairAdmissionInput())
    const completedStepId = initial.boundedRepairPlan.steps[0]?.id

    expect(completedStepId).toBeDefined()

    const admission = createCoordinatorAdmission({
      ...repairAdmissionInput(),
      repairExecutorState: {
        completedStepIds: [` ${completedStepId} `],
        priorAttemptsByStepId: completedStepId
          ? { [completedStepId]: 2 }
          : undefined
      }
    })

    expect(admission.repairExecutorPlan.records[0]).toMatchObject({
      stepId: completedStepId,
      status: 'completed',
      attempt: 2,
      retryDelayMs: null,
      skipReason: 'already_completed'
    })
  })

  it('applies bounded retry state and deterministic exponential backoff metadata', () => {
    const initial = createCoordinatorAdmission(repairAdmissionInput())
    const retriedStepId = initial.boundedRepairPlan.steps[0]?.id

    expect(retriedStepId).toBeDefined()

    const admission = createCoordinatorAdmission({
      ...repairAdmissionInput(),
      repairExecutorState: {
        priorAttemptsByStepId: retriedStepId
          ? { [` ${retriedStepId} `]: 2 }
          : undefined,
        maxAttemptsPerStep: 4,
        baseDelayMs: 500,
        maxDelayMs: 10_000
      }
    })

    expect(admission.repairExecutorPlan.retryPolicy).toEqual({
      maxAttemptsPerStep: 4,
      baseDelayMs: 500,
      maxDelayMs: 10000
    })
    expect(admission.repairExecutorPlan.records[0]).toMatchObject({
      stepId: retriedStepId,
      status: 'queued',
      attempt: 3,
      maxAttempts: 4,
      retryDelayMs: 1000
    })
  })

  it('sanitizes malformed caller executor state without replacing the bounded plan', () => {
    const input = {
      ...repairAdmissionInput(),
      repairExecutorState: {
        completedStepIds: 'not-an-array',
        priorAttemptsByStepId: ['not-an-object'],
        maxAttemptsPerStep: 999,
        baseDelayMs: -100,
        maxDelayMs: Number.POSITIVE_INFINITY,
        plan: {
          steps: []
        }
      }
    } as unknown as CoordinatorAdmissionInput

    const admission = createCoordinatorAdmission(input)

    expect(admission.boundedRepairPlan.steps.length).toBeGreaterThan(0)
    expect(admission.repairExecutorPlan.retryPolicy).toEqual({
      maxAttemptsPerStep: 5,
      baseDelayMs: 1,
      maxDelayMs: 30000
    })
    expect(admission.repairExecutorPlan.records).toHaveLength(
      admission.boundedRepairPlan.steps.length
    )
    expect(admission.repairExecutorPlan.records.every(record => record.status === 'queued')).toBe(
      true
    )
  })
})
