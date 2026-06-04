import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SearchProvider } from '../providers'
import {
  mergeCommunityResults,
  searchCommunitySources,
  shouldSearchCommunitySources
} from '../community'

describe('community search', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('runs only for unconstrained web searches', () => {
    expect(
      shouldSearchCommunitySources({
        query: 'best keyboards',
        contentTypes: ['web'],
        includeDomains: []
      })
    ).toBe(true)

    expect(
      shouldSearchCommunitySources({
        query: 'best keyboards',
        contentTypes: ['image'],
        includeDomains: []
      })
    ).toBe(false)

    expect(
      shouldSearchCommunitySources({
        query: 'best keyboards',
        contentTypes: ['web'],
        includeDomains: ['example.com']
      })
    ).toBe(false)
  })

  it('can be disabled with an environment flag', () => {
    vi.stubEnv('ENABLE_COMMUNITY_SEARCH', 'false')

    expect(
      shouldSearchCommunitySources({
        query: 'best keyboards',
        contentTypes: ['web'],
        includeDomains: []
      })
    ).toBe(false)
  })

  it('searches known community sites with the provider', async () => {
    const provider = {
      search: vi.fn().mockResolvedValue({
        query: 'best keyboards',
        images: [],
        results: [
          {
            title: 'A public thread',
            url: 'https://lemmy.world/post/1',
            content: 'Discussion'
          }
        ],
        number_of_results: 1
      })
    } satisfies SearchProvider

    const results = await searchCommunitySources({
      provider,
      query: 'best keyboards',
      searchDepth: 'basic',
      excludeDomains: [],
      maxResults: 4
    })

    expect(provider.search).toHaveBeenCalledWith(
      expect.stringContaining('site:lemmy.world'),
      4,
      'basic',
      [],
      [],
      {
        type: 'general',
        content_types: ['web']
      }
    )
    expect(results).toEqual([
      {
        title: 'A public thread',
        url: 'https://lemmy.world/post/1',
        content: 'Discussion',
        sourceType: 'community',
        communitySource: 'Lemmy'
      }
    ])
  })

  it('merges community results ahead of provider results and dedupes URLs', () => {
    expect(
      mergeCommunityResults(
        {
          query: 'query',
          images: [],
          results: [
            {
              title: 'Original',
              url: 'https://lemmy.world/post/1',
              content: 'Duplicate'
            },
            {
              title: 'Provider',
              url: 'https://example.com',
              content: 'Result'
            }
          ],
          number_of_results: 2
        },
        [
          {
            title: 'Community',
            url: 'https://lemmy.world/post/1',
            content: 'Thread',
            sourceType: 'community',
            communitySource: 'Lemmy'
          }
        ]
      )
    ).toMatchObject({
      number_of_results: 2,
      results: [
        {
          title: 'Community',
          url: 'https://lemmy.world/post/1',
          sourceType: 'community'
        },
        {
          title: 'Provider',
          url: 'https://example.com'
        }
      ]
    })
  })
})
