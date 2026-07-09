import { describe, expect, it } from 'vitest'

import type {
  EvidenceConflict,
  EvidenceGraph,
  NormalizedEvidenceItem
} from '@/lib/ai-architecture/evidence'
import type { RoutePlan } from '@/lib/ai/schemas'

import { createCoordinatorAdmission } from './admission'

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
    const admission = createCoordinatorAdmission({
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
    })

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
      retrievalAttempts: 2,
      maxRetrievalAttempts: 2,
      now
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
})
