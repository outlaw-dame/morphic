import { describe, expect, it } from 'vitest'

import type { SearchResults } from '@/lib/types'

import {
  annotateSearchResultsWithEvidence,
  normalizeSearchEvidence
} from '../evidence'
import { classifyOperationRequest } from '../router'

describe('normalizeSearchEvidence', () => {
  it('normalizes search results into cited evidence with source quality', () => {
    const evidence = normalizeSearchEvidence({
      toolCallId: 'search-123',
      query: 'nextjs csp docs',
      images: [],
      number_of_results: 2,
      results: [
        {
          title: 'Content Security Policy',
          url: 'https://nextjs.org/docs/app/guides/content-security-policy',
          content: 'Official Next.js CSP docs.'
        },
        {
          title: 'Forum thread',
          url: 'https://lemmy.world/post/123',
          content: 'Community discussion.',
          sourceType: 'community',
          communitySource: 'Lemmy'
        }
      ]
    } satisfies SearchResults)

    expect(evidence).toEqual([
      expect.objectContaining({
        id: 'search-123:1',
        citationRef: '[1](#search-123)',
        sourceKind: 'web',
        qualityTier: 'primary',
        privacyLevel: 'external_allowed'
      }),
      expect.objectContaining({
        id: 'search-123:2',
        citationRef: '[2](#search-123)',
        sourceKind: 'community',
        qualityTier: 'community',
        privacyLevel: 'external_allowed'
      })
    ])
  })

  it('marks user feeds and podcast transcripts as private evidence', () => {
    const evidence = normalizeSearchEvidence({
      toolCallId: 'search-456',
      query: 'activitypub',
      images: [],
      results: [
        {
          title: 'Saved feed item',
          url: 'https://example.com/post',
          content: 'User feed content.',
          sourceType: 'user_feed',
          feedTitle: 'My Feed'
        },
        {
          title: 'Podcast transcript',
          url: 'https://example.com/episode',
          content: 'Transcript hit.',
          sourceType: 'podcast_transcript',
          transcriptText: 'ActivityPub discussion'
        }
      ]
    } satisfies SearchResults)

    expect(evidence.map(item => item.privacyLevel)).toEqual([
      'private_allowed',
      'private_allowed'
    ])
    expect(evidence.map(item => item.sourceKind)).toEqual([
      'user_feed',
      'podcast_transcript'
    ])
  })

  it('annotates search results with evidence and verification metadata', () => {
    const annotated = annotateSearchResultsWithEvidence(
      {
        toolCallId: 'search-789',
        query: 'latest Next.js security advisory',
        images: [],
        results: [
          {
            title: 'Next.js Blog',
            url: 'https://nextjs.org/blog/security',
            content: 'Official security updates.'
          }
        ]
      },
      classifyOperationRequest('latest Next.js security advisory'),
      { retrievedAt: '2026-06-04T12:00:00.000Z' }
    )

    expect(annotated.evidence).toEqual([
      expect.objectContaining({
        id: 'search-789:1',
        qualityTier: 'primary',
        citationRef: '[1](#search-789)'
      })
    ])
    expect(annotated.evidenceVerification).toMatchObject({
      status: 'supported',
      confidence: 'high',
      evidenceCount: 1
    })
  })
})
