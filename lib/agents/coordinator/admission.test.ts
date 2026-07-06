import { describe, expect, it } from 'vitest'

import type { RoutePlan } from '@/lib/ai/schemas'
import type { SearchResultItem } from '@/lib/types'

import { createCoordinatorAdmissionFromSearchResults } from './admission'

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

function result(overrides: Partial<SearchResultItem> = {}): SearchResultItem {
  return {
    title: 'Evidence report',
    url: 'https://www.cdc.gov/example/report',
    content: 'A public health agency report states the reviewed claim clearly.',
    publishedAt: retrievedAt,
    ...overrides
  }
}

describe('createCoordinatorAdmissionFromSearchResults', () => {
  it('admits composition when route and search evidence satisfy coordinator policies', () => {
    const admission = createCoordinatorAdmissionFromSearchResults({
      routePlan: {
        ...baseRoutePlan,
        needsFreshness: true,
        requiredSourceClasses: [
          'government_or_regulator',
          'academic_or_peer_reviewed'
        ]
      },
      evidenceInput: {
        query: 'public health evidence',
        retrievedAt,
        results: [
          result({
            url: 'https://www.cdc.gov/example/report',
            title: 'CDC evidence report'
          }),
          result({
            url: 'https://example.edu/research/paper',
            title: 'University research paper'
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
    const admission = createCoordinatorAdmissionFromSearchResults({
      routePlan: {
        ...baseRoutePlan,
        riskLevel: 'critical',
        mode: 'adaptive'
      },
      evidenceInput: {
        query: 'critical disputed claim',
        retrievedAt,
        results: [
          result({
            url: 'https://www.reddit.com/r/example/comments/123/report',
            title: 'Reddit discussion'
          }),
          result({
            url: 'https://x.com/example/status/123',
            title: 'Social post'
          })
        ]
      },
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
