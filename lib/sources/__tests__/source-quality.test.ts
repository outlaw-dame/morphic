import { describe, expect, it, vi } from 'vitest'

import type { SearchResultItem } from '@/lib/types'

import {
  applySourceQualityToSearchResults,
  scoreSearchResultSource
} from '../source-quality'

describe('source quality', () => {
  it('ranks primary and scholarly sources ahead of thin promotional pages', () => {
    const ranked = applySourceQualityToSearchResults(
      [
        {
          title: 'Best deals on climate facts',
          url: 'https://promo.example/coupon-climate',
          content: 'Sponsored promo code.'
        },
        {
          title: 'Climate report',
          url: 'https://www.noaa.gov/climate/report',
          content:
            'Primary climate report with measurements, trend analysis, and methodology.'
        },
        {
          title: 'Research article',
          url: 'https://www.nature.com/articles/example',
          content:
            'Peer reviewed climate attribution research with detailed citations.'
        }
      ],
      'climate attribution research'
    )

    expect(
      ranked
        .slice(0, 2)
        .map(result => result.url)
        .sort()
    ).toEqual([
      'https://www.nature.com/articles/example',
      'https://www.noaa.gov/climate/report'
    ])
    expect(ranked[0].sourceQuality?.tier).toBe('high')
    expect(ranked[1].sourceQuality?.tier).toBe('high')
    expect(ranked[2].sourceQuality?.signals).toContain('low-quality-pattern')
  })

  it('boosts fresh dated results for current-news queries', () => {
    const nowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-06-30T12:00:00Z').getTime())

    const fresh: SearchResultItem = {
      title: 'World Cup update',
      url: 'https://apnews.com/world-cup-update',
      content: 'Latest World Cup news and match reporting.',
      publishedAt: '2026-06-30T10:00:00Z'
    }
    const stale: SearchResultItem = {
      title: 'World Cup archive',
      url: 'https://apnews.com/world-cup-archive',
      content: 'World Cup article from a prior tournament.',
      publishedAt: '2024-06-30T10:00:00Z'
    }

    expect(
      scoreSearchResultSource(fresh, 'latest World Cup news').score
    ).toBeGreaterThan(
      scoreSearchResultSource(stale, 'latest World Cup news').score
    )

    nowSpy.mockRestore()
  })

  it('does not randomly demote user feed items from independent publishers', () => {
    const quality = scoreSearchResultSource(
      {
        title: 'Independent analysis',
        url: 'https://smallpublisher.example/analysis',
        content:
          'Detailed independent analysis from a source the user subscribed to through a feed.',
        retrievalMethod: 'feed',
        sourceKind: 'feed-item'
      },
      'independent analysis'
    )

    expect(quality.score).toBeGreaterThanOrEqual(55)
    expect(quality.signals).toContain('user-feed')
  })
})
