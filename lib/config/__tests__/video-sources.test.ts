import { describe, expect, it } from 'vitest'

import {
  buildOwncastSearchQuery,
  isLikelyOwncastResult,
  OWNCAST_DISCOVERY_DOMAINS
} from '../video-sources'

describe('video sources', () => {
  it('targets public Owncast discovery surfaces', () => {
    expect(OWNCAST_DISCOVERY_DOMAINS).toEqual(
      expect.arrayContaining([
        'owncast.directory',
        'watch.owncast.online',
        'owncast.fediverse.observer'
      ])
    )
  })

  it('builds an Owncast search query', () => {
    const query = buildOwncastSearchQuery('live coding')

    expect(query).toContain('(live coding)')
    expect(query).toContain('"Owncast"')
    expect(query).toContain('site:owncast.directory')
    expect(query).toContain('OR site:owncast.fediverse.observer')
  })

  it('identifies Owncast results by URL and metadata', () => {
    expect(
      isLikelyOwncastResult({
        link: 'https://watch.owncast.online/',
        title: 'Owncast TV',
        snippet: '',
        source: '',
        channel: ''
      })
    ).toBe(true)

    expect(
      isLikelyOwncastResult({
        link: 'https://stream.example.com/',
        title: 'Powered by Owncast',
        snippet: '',
        source: '',
        channel: ''
      })
    ).toBe(true)

    expect(
      isLikelyOwncastResult({
        link: 'https://example.com/',
        title: 'Video',
        snippet: '',
        source: '',
        channel: ''
      })
    ).toBe(false)
  })
})
