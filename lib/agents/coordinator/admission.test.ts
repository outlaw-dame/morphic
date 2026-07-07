import { describe, expect, it } from 'vitest'

import type {
  EvidenceGraph,
  NormalizedEvidenceItem
} from '@/lib/ai-architecture/evidence'
import type { RoutePlan } from '@/lib/ai/schemas'
import type { SearchResultItem } from '@/lib/types'

import {
  createCoordinatorAdmission,
  createCoordinatorAdmissionFromSearchResults
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
  rationale: 'admission test route'
}

function searchResult(overrides: Partial<SearchResultItem> = {}): SearchResultItem {
  return {
    title: 'Evidence report',
    url: 'https://www.cdc.gov/example/report',
    content: 'A public health agency report states the reviewed claim clearly.',
    publishedAt: retrievedAt,
    ...overrides
  }
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

describe('coordinator admission bridge', () => {
  it('admits composition from search results when route policies can proceed', () => {
    const admission = createCoordinatorAdmissionFromSearchResults({
      routePlan: {
        ...baseRoutePlan,
        needsFreshness: true
      },
      evidenceInput: {
        query: 'public health evidence',
        retrievedAt,
        results: [
          searchResult({
            url: 'https://www.cdc.gov/example/report',
            title: 'CDC evidence report'
          })
        ]
      },
      completedRoles: ['router', 'retriever'],
      now
    })

    expect(admission.status).toBe('compose')
    expect(admission.canCompose).toBe(true)
    expect(admission.blockedPolicyIds).toEqual([])
    expect(admission.requiredRepairActions).not.toContain('retrieve_fresh_sources')
    expect(admission.decision.stopConditions).toContain('composition_allowed')
    expect(admission.decision.activeModelRoles).toContain('citation_verifier')
  })

  it('returns repair admission metadata when critical evidence is weak-only', () => {
    const weakQuality = {
      ...evidenceItem().sourceQuality,
      sourceClass: 'forum_or_reddit' as const,
      evidenceRole: 'community_signal' as const,
      influenceCap: 0.28,
      finalWeight: 0.28
    }
    const admission = createCoordinatorAdmission({
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
          url: 'https://social.example.net/report',
          canonicalUrl: 'https://social.example.net/report',
          host: 'social.example.net',
          sourceClass: 'social_media',
          evidenceRole: 'firsthand_experience',
          sourceQuality: {
            ...weakQuality,
            sourceClass: 'social_media',
            evidenceRole: 'firsthand_experience',
            influenceCap: 0.18,
            finalWeight: 0.18
          }
        })
      ]),
      completedRoles: ['router', 'retriever'],
      now
    })

    expect(admission.status).toBe('repair')
    expect(admission.canCompose).toBe(false)
    expect(admission.blockedPolicyIds).toContain('source_mix')
    expect(admission.requiredRepairActions).toContain('retrieve_authoritative_sources')
    expect(admission.requiredRepairActions).toContain('run_advisor_review')
    expect(admission.decision.stopConditions).toContain(
      'composition_waiting_for_repairs'
    )
  })
})
