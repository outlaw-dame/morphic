import { describe, expect, it } from 'vitest'

import type {
  EvidenceGraph,
  NormalizedEvidenceItem
} from '@/lib/ai-architecture/evidence'
import type { RoutePlan } from '@/lib/ai/schemas'

import { coordinateExecution } from './coordinator'
import { createCoordinatorExecutionState } from './execution-state'

const retrievedAt = '2026-07-05T12:00:00.000Z'
const now = new Date('2026-07-06T00:00:00.000Z')

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
  rationale: 'test route'
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

function evidenceGraph(
  items: NormalizedEvidenceItem[],
  warnings: string[] = []
): EvidenceGraph {
  return {
    items,
    duplicateGroups: [],
    claimClusters: [],
    conflicts: [],
    claimsByEvidenceId: {},
    warnings
  }
}

describe('coordinateExecution', () => {
  it('allows composition when evidence satisfies all route policies', () => {
    const state = createCoordinatorExecutionState({
      routePlan: baseRoutePlan,
      evidenceGraph: evidenceGraph([
        evidenceItem(),
        evidenceItem({
          id: 'ev_two',
          url: 'https://other.example.net/report',
          canonicalUrl: 'https://other.example.net/report',
          host: 'other.example.net'
        })
      ])
    })

    const result = coordinateExecution(state, now)

    expect(result.repairPlan.canProceedToComposition).toBe(true)
    expect(result.decision.stopConditions).toContain('composition_allowed')
    expect(result.decision.activeModelRoles).toContain('citation_verifier')
  })

  it('holds high-risk composition when only weak sources are available', () => {
    const state = createCoordinatorExecutionState({
      routePlan: {
        ...baseRoutePlan,
        riskLevel: 'high',
        mode: 'critical',
        needsAdvisorReview: true
      },
      evidenceGraph: evidenceGraph([
        evidenceItem({
          sourceClass: 'forum_or_reddit',
          evidenceRole: 'community_signal',
          sourceQuality: {
            ...evidenceItem().sourceQuality,
            sourceClass: 'forum_or_reddit',
            evidenceRole: 'community_signal',
            influenceCap: 0.28,
            finalWeight: 0.28
          }
        })
      ])
    })

    const result = coordinateExecution(state, now)

    expect(result.repairPlan.canProceedToComposition).toBe(false)
    expect(result.repairPlan.actions).toContain('retrieve_authoritative_sources')
    expect(result.repairPlan.actions).toContain('run_advisor_review')
    expect(result.decision.activeModelRoles).toContain('advisor')
  })

  it('blocks critical risk routes with only weak sources', () => {
    const weakQuality = {
      ...evidenceItem().sourceQuality,
      sourceClass: 'forum_or_reddit' as const,
      evidenceRole: 'community_signal' as const,
      influenceCap: 0.28,
      finalWeight: 0.28
    }
    const state = createCoordinatorExecutionState({
      routePlan: {
        ...baseRoutePlan,
        riskLevel: 'critical',
        mode: 'adaptive'
      },
      evidenceGraph: evidenceGraph([
        evidenceItem({
          sourceClass: 'forum_or_reddit',
          evidenceRole: 'community_signal',
          sourceQuality: weakQuality
        }),
        evidenceItem({
          id: 'ev_two',
          url: 'https://other.example.net/forum',
          canonicalUrl: 'https://other.example.net/forum',
          host: 'other.example.net',
          sourceClass: 'forum_or_reddit',
          evidenceRole: 'community_signal',
          sourceQuality: weakQuality
        })
      ])
    })

    const result = coordinateExecution(state, now)

    expect(result.repairPlan.canProceedToComposition).toBe(false)
    expect(result.repairPlan.actions).toContain('retrieve_authoritative_sources')
  })

  it('requires fresh retrieval for freshness-sensitive routes', () => {
    const state = createCoordinatorExecutionState({
      routePlan: {
        ...baseRoutePlan,
        needsFreshness: true
      },
      evidenceGraph: evidenceGraph([
        evidenceItem({
          publishedAt: '2026-07-01T00:00:00.000Z',
          retrievedAt: '2026-07-01T00:00:00.000Z'
        })
      ])
    })

    const result = coordinateExecution(state, now)

    expect(result.repairPlan.canProceedToComposition).toBe(false)
    expect(result.repairPlan.actions).toContain('retrieve_fresh_sources')
    expect(result.decision.retrievalPaths).toContain('retrieve_fresh_sources')
  })

  it('evaluates large freshness evidence arrays without spreading timestamps', () => {
    const items = Array.from({ length: 20_000 }, (_, index) =>
      evidenceItem({
        id: `ev_${index}`,
        publishedAt: '2026-07-01T00:00:00.000Z',
        retrievedAt: '2026-07-01T00:00:00.000Z'
      })
    )

    items.push(
      evidenceItem({
        id: 'ev_recent',
        publishedAt: '2026-07-05T12:00:00.000Z',
        retrievedAt: '2026-07-05T12:00:00.000Z'
      })
    )

    const state = createCoordinatorExecutionState({
      routePlan: {
        ...baseRoutePlan,
        needsFreshness: true
      },
      evidenceGraph: evidenceGraph(items)
    })

    const result = coordinateExecution(state, now)

    expect(result.repairPlan.canProceedToComposition).toBe(true)
    expect(result.repairPlan.actions).not.toContain('retrieve_fresh_sources')
  })

  it('requires entity grounding when the route asks for it', () => {
    const state = createCoordinatorExecutionState({
      routePlan: {
        ...baseRoutePlan,
        needsEntityGrounding: true
      },
      evidenceGraph: evidenceGraph([evidenceItem()])
    })

    const result = coordinateExecution(state, now)

    expect(result.repairPlan.canProceedToComposition).toBe(false)
    expect(result.repairPlan.actions).toContain('run_entity_grounding')
  })

  it('escalates contradiction warnings before high-risk composition', () => {
    const state = createCoordinatorExecutionState({
      routePlan: {
        ...baseRoutePlan,
        riskLevel: 'high'
      },
      evidenceGraph: evidenceGraph([evidenceItem()], ['contradiction detected'])
    })

    const result = coordinateExecution(state, now)

    expect(result.repairPlan.canProceedToComposition).toBe(false)
    expect(result.repairPlan.actions).toContain('run_contradiction_review')
    expect(result.repairPlan.actions).toContain('run_advisor_review')
  })

  it('blocks critical contradiction warnings', () => {
    const state = createCoordinatorExecutionState({
      routePlan: {
        ...baseRoutePlan,
        riskLevel: 'critical'
      },
      evidenceGraph: evidenceGraph([evidenceItem()], ['disputed evidence'])
    })

    const result = coordinateExecution(state, now)

    expect(result.repairPlan.canProceedToComposition).toBe(false)
    expect(result.repairPlan.actions).toContain('run_contradiction_review')
  })

  it('ignores contradiction marker substrings', () => {
    const state = createCoordinatorExecutionState({
      routePlan: {
        ...baseRoutePlan,
        riskLevel: 'high'
      },
      evidenceGraph: evidenceGraph([evidenceItem()], ['the claim is undisputed'])
    })

    const result = coordinateExecution(state, now)

    expect(result.repairPlan.actions).not.toContain('run_contradiction_review')
  })

  it('holds when required source classes are missing', () => {
    const state = createCoordinatorExecutionState({
      routePlan: {
        ...baseRoutePlan,
        requiredSourceClasses: ['official_source']
      },
      evidenceGraph: evidenceGraph([evidenceItem()])
    })

    const result = coordinateExecution(state, now)

    expect(result.repairPlan.canProceedToComposition).toBe(false)
    expect(result.repairPlan.actions).toContain('retrieve_required_source_classes')
  })

  it('holds when there is no usable evidence', () => {
    const state = createCoordinatorExecutionState({
      routePlan: baseRoutePlan,
      evidenceGraph: evidenceGraph([])
    })

    const result = coordinateExecution(state, now)

    expect(result.repairPlan.canProceedToComposition).toBe(false)
    expect(result.repairPlan.actions).toContain('retrieve_more_sources')
  })

  it('warns adaptive routes with one independent host', () => {
    const state = createCoordinatorExecutionState({
      routePlan: baseRoutePlan,
      evidenceGraph: evidenceGraph([evidenceItem()])
    })

    const result = coordinateExecution(state, now)

    expect(result.repairPlan.canProceedToComposition).toBe(true)
    expect(result.repairPlan.actions).toContain('retrieve_independent_sources')
    expect(result.decision.retrievalPaths).toContain('retrieve_independent_sources')
  })
})
