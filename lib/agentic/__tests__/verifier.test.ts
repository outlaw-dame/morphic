import { describe, expect, it } from 'vitest'

import type { MorphicEvidenceItem, RoutingDecision } from '../types'
import { verifyEvidenceSet } from '../verifier'

const citedFreshEvidence: MorphicEvidenceItem = {
  id: 'search-1:1',
  title: 'Official docs',
  url: 'https://developers.cloudflare.com/workers-ai/models/',
  content: 'Model listing',
  sourceKind: 'web',
  qualityTier: 'primary',
  privacyLevel: 'external_allowed',
  citationRef: '[1](#search-1)',
  retrievedAt: '2026-06-04T12:00:00.000Z'
}

const freshResearchDecision: RoutingDecision = {
  taskType: 'research',
  privacyLevel: 'external_allowed',
  difficulty: 'medium',
  latencyBudgetMs: 20_000,
  costBudgetCents: 2,
  requiresTools: true,
  requiresFreshness: true,
  requiresCitations: true,
  requiresDeterminism: false,
  escalationPolicy: 'on_low_confidence'
}

describe('verifyEvidenceSet', () => {
  it('requires evidence when citations are required', () => {
    expect(verifyEvidenceSet([], freshResearchDecision)).toMatchObject({
      status: 'insufficient',
      issues: [
        expect.objectContaining({
          code: 'missing_evidence',
          severity: 'high'
        })
      ]
    })
  })

  it('passes fresh cited evidence from primary sources', () => {
    expect(
      verifyEvidenceSet([citedFreshEvidence], freshResearchDecision, {
        now: '2026-06-04T12:10:00.000Z'
      })
    ).toMatchObject({
      status: 'supported',
      confidence: 'high',
      primarySourceCount: 1
    })
  })

  it('flags stale evidence for freshness-sensitive work', () => {
    expect(
      verifyEvidenceSet([citedFreshEvidence], freshResearchDecision, {
        now: '2026-06-04T12:00:00.002Z',
        maxFreshnessAgeMs: 1
      })
    ).toMatchObject({
      status: 'needs_review',
      issues: [
        expect.objectContaining({
          code: 'stale_evidence',
          severity: 'medium'
        })
      ]
    })
  })
})
