import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SearchProvider } from '../providers'
import {
  mergeVideoResults,
  searchOwncastSources,
  shouldSearchOwncastSources
} from '../video-sources'

describe('Owncast source search', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('runs only for unconstrained video searches', () => {
    expect(
      shouldSearchOwncastSources({
        query: 'live coding',
        contentTypes: ['video'],
        includeDomains: []
      })
    ).toBe(true)

    expect(
      shouldSearchOwncastSources({
        query: 'live coding',
        contentTypes: ['web'],
        includeDomains: []
      })
    ).toBe(false)

    expect(
      shouldSearchOwncastSources({
        query: 'live coding',
        contentTypes: ['video'],
        includeDomains: ['example.com']
      })
    ).toBe(false)
  })

  it('can be disabled with an environment flag', () => {
    vi.stubEnv('ENABLE_OWNCAST_SEARCH', 'false')

    expect(
      shouldSearchOwncastSources({
        query: 'live coding',
        contentTypes: ['video'],
        includeDomains: []
      })
    ).toBe(false)
  })

  it('searches and converts Owncast web results to video candidates', async () => {
    const provider = {
      search: vi.fn().mockResolvedValue({
        query: 'live coding',
        images: [],
        videos: [],
        results: [
          {
            title: 'Owncast TV',
            url: 'https://watch.owncast.online/',
            content: 'A public Owncast stream'
          }
        ],
        number_of_results: 1
      })
    } satisfies SearchProvider

    const videos = await searchOwncastSources({
      provider,
      query: 'live coding',
      searchDepth: 'basic',
      excludeDomains: [],
      maxResults: 3
    })

    expect(provider.search).toHaveBeenCalledWith(
      expect.stringContaining('site:owncast.directory'),
      3,
      'basic',
      [],
      [],
      {
        type: 'general',
        content_types: ['web', 'video']
      }
    )
    expect(videos).toEqual([
      expect.objectContaining({
        title: 'Owncast TV',
        link: 'https://watch.owncast.online/',
        source: 'Owncast',
        channel: 'Owncast'
      })
    ])
  })

  it('merges Owncast videos ahead of provider videos and dedupes links', () => {
    expect(
      mergeVideoResults(
        {
          query: 'query',
          images: [],
          results: [],
          videos: [
            {
              title: 'Original',
              link: 'https://watch.owncast.online/',
              snippet: '',
              imageUrl: '',
              duration: '',
              source: '',
              channel: '',
              date: '',
              position: 1
            }
          ],
          number_of_results: 0
        },
        [
          {
            title: 'Owncast TV',
            link: 'https://watch.owncast.online/',
            snippet: 'Public stream',
            imageUrl: '',
            duration: '',
            source: 'Owncast',
            channel: 'Owncast',
            date: '',
            position: 1
          }
        ]
      )
    ).toMatchObject({
      videos: [
        {
          title: 'Owncast TV',
          link: 'https://watch.owncast.online/',
          source: 'Owncast'
        }
      ]
    })
  })
})
