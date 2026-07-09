import { describe, expect, it } from 'vitest'

import type {
  EvidenceConflict,
  EvidenceGraph,
  NormalizedEvidenceItem
} from '@/lib/ai-architecture/evidence'
import type { RoutePlan } from '@/lib/ai/schemas'

import { createCoordinatorAdmission } from './admission'

const now = new Date('2026-07-06T00:00:00.000Z')
const staleRetrievedAt = '2026-07-01T00:00:00.000Z'
const currentRetrievedAt = '2026-07-05T12:00:00.000Z'

const routePlan: RoutePlan = {
  mode: 'adaptive',
  riskLevel: 'high',
  requiredSourceClasses: [],
  requiredModelRoles: ['router', 'retriever', 'answer_composer'],
  needsFreshness: false,
  needsEntityGrounding: false,
  needsAdvisorReview: false,
  needsCitationVerification: true,
  maxToolCalls: 35,
  rationale: 'repair budget regression route'
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
    summary: 'The report contains a numeric claim.',
    retrievalPath: 'search',
    publishedAt: currentRetrievedAt,
    retrievedAt: currentRetrievedAt,
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

function numericConflict(overrides: Partial<EvidenceConflict> = {}): EvidenceConflict {
  return {
    id: 'numeric_conflict',
    type: 'numeric_mismatch',
    severity: 'warn',
    evidenceIds: ['ev_one', 'ev_two'],
    claimIds: ['cl_one', 'cl_two'],
    reason: 'Similar claims contain different numeric values.',
    ...overrides
  }
}

function evidenceGraph(items: NormalizedEvidenceItem[]): EvidenceGraph {
  return {
    items,
    duplicateGroups: [],
    claimClusters: [],
    conflicts: [numericConflict()],
    claimsByEvidenceId: {},
    warnings: []
  }
}

describe('coordinator admission repair budget regressions', () => {
  it('keeps freshness retrieval ahead of medium contradiction retrieval when budget is contested', () => {
    const admission = createCoordinatorAdmission({
      routePlan: {
        ...routePlan,
        needsFreshness: true
      },
      evidenceGraph: evidenceGraph([
        evidenceItem({
          id: 'ev_one',
          publishedAt: staleRetrievedAt,
          retrievedAt: staleRetrievedAt
        }),
        evidenceItem({
          id: 'ev_two',
          url: 'https://other.example.net/report',
          canonicalUrl: 'https://other.example.net/report',
          host: 'other.example.net',
          claimIds: ['cl_two'],
          publishedAt: staleRetrievedAt,
          retrievedAt: staleRetrievedAt
        })
      ]),
      completedRoles: ['router', 'retriever'],
      retrievalAttempts: 1,
      maxRetrievalAttempts: 2,
      now
    })

    const repairActions = admission.boundedRepairPlan.steps.map(step => step.action)

    expect(admission.blockedPolicyIds).toEqual(
      expect.arrayContaining(['freshness', 'contradictions'])
    )
    expect(repairActions).toContain('retrieve_fresh_sources')
    expect(repairActions).not.toContain('retrieve_primary_numeric_source')
  })

  it('keeps freshness retrieval ahead of medium contradiction retrieval when step capacity is contested', () => {
    const admission = createCoordinatorAdmission({
      routePlan: {
        ...routePlan,
        needsFreshness: true
      },
      evidenceGraph: evidenceGraph([
        evidenceItem({
          id: 'ev_one',
          publishedAt: staleRetrievedAt,
          retrievedAt: staleRetrievedAt
        }),
        evidenceItem({
          id: 'ev_two',
          url: 'https://other.example.net/report',
          canonicalUrl: 'https://other.example.net/report',
          host: 'other.example.net',
          claimIds: ['cl_two'],
          publishedAt: staleRetrievedAt,
          retrievedAt: staleRetrievedAt
        })
      ]),
      completedRoles: ['router', 'retriever'],
      retrievalAttempts: 0,
      maxRetrievalAttempts: 2,
      now
    })

    const repairActions = admission.boundedRepairPlan.steps.map(step => step.action)

    expect(admission.blockedPolicyIds).toEqual(
      expect.arrayContaining(['freshness', 'contradictions'])
    )
    expect(repairActions).toContain('retrieve_fresh_sources')
    expect(repairActions).not.toContain('retrieve_primary_numeric_source')
    expect(admission.boundedRepairPlan.steps.length).toBeLessThanOrEqual(5)
  })

  it('retains blocked contradiction retrieval when another non-retrieval blocker exists and capacity remains', () => {
    const admission = createCoordinatorAdmission({
      routePlan: {
        ...routePlan,
        needsEntityGrounding: true,
        needsCitationVerification: false
      },
      evidenceGraph: evidenceGraph([
        evidenceItem(),
        evidenceItem({
          id: 'ev_two',
          url: 'https://other.example.net/report',
          canonicalUrl: 'https://other.example.net/report',
          host: 'other.example.net',
          claimIds: ['cl_two']
        })
      ]),
      completedRoles: ['router', 'retriever'],
      retrievalAttempts: 0,
      maxRetrievalAttempts: 2,
      now
    })

    const repairActions = admission.boundedRepairPlan.steps.map(step => step.action)

    expect(admission.blockedPolicyIds).toEqual(
      expect.arrayContaining(['entity_grounding', 'contradictions'])
    )
    expect(repairActions).toContain('run_entity_grounding')
    expect(repairActions).toContain('retrieve_primary_numeric_source')
    expect(admission.boundedRepairPlan.remainingRetrievalAttempts).toBe(1)
  })
})
