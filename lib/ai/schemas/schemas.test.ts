import { describe, expect, it } from 'vitest'

import {
  AdvisorFindingSchema,
  EvidenceItemSchema,
  RoutePlanSchema,
  SourceQualityAssessmentSchema
} from './index'

describe('AI shared schemas', () => {
  it('parses a route plan with default gates', () => {
    const parsed = RoutePlanSchema.parse({
      mode: 'adaptive',
      riskLevel: 'medium',
      maxToolCalls: 20,
      rationale: 'Needs current sources and citation verification.'
    })

    expect(parsed.requiredSourceClasses).toEqual([])
    expect(parsed.requiredModelRoles).toEqual([])
    expect(parsed.needsCitationVerification).toBe(true)
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

  it('parses evidence items with source and role metadata', () => {
    const parsed = EvidenceItemSchema.parse({
      id: 'ev_1',
      url: 'https://example.com/report',
      title: 'Example report',
      sourceClass: 'official_source',
      evidenceRole: 'primary_authority',
      summary: 'The source directly supports the claim.',
      retrievalPath: 'official',
      retrievedAt: '2026-07-04T00:00:00.000Z',
      confidence: 0.9
    })

    expect(parsed.claimIds).toEqual([])
    expect(parsed.confidence).toBe(0.9)
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
      influenceCap: 0.8,
      requiresCorroboration: false
    })
    const finding = AdvisorFindingSchema.parse({
      severity: 'warning',
      finding: 'Claim needs a stronger source.',
      recommendation: 'Add a primary or official source.'
    })

    expect(quality.conflictOfInterestPenalty).toBe(0)
    expect(quality.allowedClaimTypes).toEqual([])
    expect(finding.requiresRepair).toBe(false)
  })
})
