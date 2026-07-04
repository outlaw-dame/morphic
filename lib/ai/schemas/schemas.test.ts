import { describe, expect, it } from 'vitest'

import {
  AdvisorFindingSchema,
  CoordinatorDecisionSchema,
  EvidenceItemSchema,
  RoutePlanSchema,
  SourceQualityAssessmentSchema
} from './index'

describe('AI shared schemas', () => {
  it('parses a route plan with default gates', () => {
    const parsed = RoutePlanSchema.parse({
      mode: 'adaptive',
      riskLevel: 'medium',
      rationale: 'Needs current sources and citation verification.'
    })

    expect(parsed.requiredSourceClasses).toEqual([])
    expect(parsed.requiredModelRoles).toEqual([])
    expect(parsed.needsCitationVerification).toBe(true)
    expect(parsed.maxToolCalls).toBe(20)
  })

  it('rejects out-of-range route tool budgets', () => {
    expect(() =>
      RoutePlanSchema.parse({
        mode: 'quick',
        riskLevel: 'low',
        maxToolCalls: 0,
        rationale: 'Invalid budget.'
      })
    ).toThrow()
  })

  it('defaults coordinator active roles when omitted', () => {
    const parsed = CoordinatorDecisionSchema.parse({
      routePlan: {
        mode: 'quick',
        riskLevel: 'low',
        rationale: 'Simple route.'
      }
    })

    expect(parsed.activeModelRoles).toEqual([])
    expect(parsed.retrievalPaths).toEqual([])
  })

  it('parses evidence items with source and role metadata', () => {
    const parsed = EvidenceItemSchema.parse({
      id: 'ev_1',
      url: 'https://example.com/report',
      title: 'Example report',
      sourceClass: 'official_source',
      evidenceRole: 'primary_authority',
      quotedText: null,
      summary: 'The source directly supports the claim.',
      retrievalPath: 'official',
      publishedAt: null,
      retrievedAt: '2026-07-04T00:00:00.000Z',
      confidence: 0.9
    })

    expect(parsed.claimIds).toEqual([])
    expect(parsed.confidence).toBe(0.9)
    expect(parsed.quotedText).toBeNull()
    expect(parsed.publishedAt).toBeNull()
  })

  it('parses source quality assessments and advisor findings', () => {
    const quality = SourceQualityAssessmentSchema.parse({
      sourceClass: 'established_news',
      evidenceRole: 'original_reporting',
      sourceClassScore: 0.8,
      topicalAuthorityScore: 0.7,
      transparencyScore: 0.7,
      originalityScore: 0.8,
      freshnessScore: 0.9,
      corroborationScore: 0.6,
      finalWeight: 0.7,
      influenceCap: 0.8
    })
    const finding = AdvisorFindingSchema.parse({
      severity: 'warning',
      claimId: null,
      finding: 'Claim needs a stronger source.',
      recommendation: 'Add a primary or official source.'
    })

    expect(quality.conflictOfInterestPenalty).toBe(0)
    expect(quality.allowedClaimTypes).toEqual([])
    expect(quality.requiresCorroboration).toBe(false)
    expect(finding.claimId).toBeNull()
    expect(finding.requiresRepair).toBe(false)
  })
})
