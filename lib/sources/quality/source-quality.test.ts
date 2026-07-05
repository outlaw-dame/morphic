import { describe, expect, it } from 'vitest'

import {
  assessSourceQuality,
  classifySource,
  inferEvidenceRole
} from './source-quality'

describe('source quality engine', () => {
  it('classifies official and regulator sources with high influence caps', () => {
    const assessment = assessSourceQuality({
      url: 'https://www.ftc.gov/news-events/example',
      publishedAt: '2026-07-01T00:00:00.000Z',
      assessedAt: '2026-07-05T00:00:00.000Z',
      signals: {
        hasAuthor: true,
        hasPublicationDate: true,
        hasCitations: true,
        hasClearCorrectionsPolicy: true
      }
    })

    expect(assessment.sourceClass).toBe('government_or_regulator')
    expect(assessment.evidenceRole).toBe('official_claim')
    expect(assessment.influenceCap).toBe(1)
    expect(assessment.finalWeight).toBeGreaterThan(0.75)
    expect(assessment.requiresCorroboration).toBe(false)
  })

  it('caps Reddit/forum evidence and limits it to community claim types', () => {
    const assessment = assessSourceQuality({
      url: 'https://www.reddit.com/r/search/comments/example',
      corroboratingIndependentSources: 3,
      userPreferenceModifier: 1
    })

    expect(assessment.sourceClass).toBe('forum_or_reddit')
    expect(assessment.evidenceRole).toBe('community_signal')
    expect(assessment.influenceCap).toBe(0.28)
    expect(assessment.finalWeight).toBeLessThanOrEqual(0.28)
    expect(assessment.requiresCorroboration).toBe(true)
    expect(assessment.allowedClaimTypes).toContain('community_report')
    expect(assessment.disallowedClaimTypes).toContain('medical_advice')
  })

  it('downweights content farms and scraper-like pages', () => {
    const assessment = assessSourceQuality({
      url: 'https://example.com/listicle',
      sourceClass: 'content_farm',
      signals: {
        hasExcessiveAds: true,
        hasAIGeneratedPattern: true,
        isScrapedOrRepublished: true
      }
    })

    expect(assessment.sourceClass).toBe('content_farm')
    expect(assessment.evidenceRole).toBe('unsafe_for_factual_claim')
    expect(assessment.spamOrContentFarmPenalty).toBeGreaterThanOrEqual(0.7)
    expect(assessment.finalWeight).toBeLessThanOrEqual(0.08)
    expect(assessment.disallowedClaimTypes).toContain('confirmed_fact')
  })

  it('keeps user preference modifiers bounded and separate from source class quality', () => {
    const preferred = assessSourceQuality({
      sourceClass: 'established_news',
      evidenceRole: 'original_reporting',
      userPreferenceModifier: 3
    })

    const neutral = assessSourceQuality({
      sourceClass: 'established_news',
      evidenceRole: 'original_reporting'
    })

    expect(preferred.userPreferenceModifier).toBe(1)
    expect(preferred.sourceClassScore).toBe(neutral.sourceClassScore)
    expect(preferred.evidenceRole).toBe(neutral.evidenceRole)
    expect(preferred.finalWeight).toBeGreaterThanOrEqual(neutral.finalWeight)
  })

  it('provides deterministic source and evidence-role helpers', () => {
    expect(classifySource({ url: 'https://www.wikidata.org/wiki/Q42' })).toBe(
      'wiki_or_knowledge_graph'
    )
    expect(inferEvidenceRole('court_or_legal_record')).toBe(
      'regulatory_or_legal_record'
    )
  })
})
