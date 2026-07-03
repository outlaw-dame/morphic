import { afterEach, describe, expect, it, vi } from 'vitest'

import { DuckDuckGoSearchProvider } from '../duckduckgo'
import { QwantSearchProvider } from '../qwant'
import { clearPublicSearXNGInstanceCache } from '../searxng-public-instances'

const originalFetch = globalThis.fetch

describe('QwantSearchProvider', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
    delete process.env.SEARXNG_API_URL
    delete process.env.SEARXNG_PUBLIC_INSTANCES_ENABLED
    delete process.env.SEARXNG_PUBLIC_INSTANCES
    delete process.env.SEARXNG_PUBLIC_INSTANCE_LIMIT
    delete process.env.SEARXNG_PUBLIC_REQUIRE_HTTPS
    clearPublicSearXNGInstanceCache()
  })

  it('routes searches through the Qwant engine in SearXNG', async () => {
    process.env.SEARXNG_API_URL = 'http://localhost:18080'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: 'morphic github',
        number_of_results: 2,
        results: [
          {
            title: 'Morphic GitHub',
            url: 'https://github.com/miurla/morphic',
            content: 'An AI-powered search engine.',
            img_src: ''
          },
          {
            title: 'Morphic screenshot',
            url: 'https://example.com/image',
            content: '',
            img_src: '/image-proxy?url=example'
          }
        ]
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const provider = new QwantSearchProvider()
    const results = await provider.search('morphic github', 10, 'basic', [], [])

    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.origin).toBe('http://localhost:18080')
    expect(url.pathname).toBe('/search')
    expect(url.searchParams.get('engines')).toBe('qwant')
    expect(url.searchParams.get('format')).toBe('json')
    expect(results.results).toEqual([
      {
        title: 'Morphic GitHub',
        url: 'https://github.com/miurla/morphic',
        content: 'An AI-powered search engine.'
      }
    ])
    expect(results.images).toEqual([
      'http://localhost:18080/image-proxy?url=example'
    ])
  })

  it('falls back to DuckDuckGo when SearXNG reports Qwant as unresponsive', async () => {
    process.env.SEARXNG_API_URL = 'http://localhost:18080'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          query: 'morphic',
          number_of_results: 0,
          results: [],
          unresponsive_engines: [['qwant', 'access denied']]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          query: 'morphic',
          number_of_results: 1,
          results: [
            {
              title: 'Morphic',
              url: 'https://www.morphic.sh/',
              content: 'Open-source AI search engine.',
              img_src: ''
            }
          ]
        })
      })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const provider = new QwantSearchProvider()
    const results = await provider.search('morphic', 10, 'basic', [], [])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(
      new URL(fetchMock.mock.calls[0][0]).searchParams.get('engines')
    ).toBe('qwant')
    expect(
      new URL(fetchMock.mock.calls[1][0]).searchParams.get('engines')
    ).toBe('duckduckgo')
    expect(results.results[0]?.url).toBe('https://www.morphic.sh/')
  })

  it('discovers public SearXNG instances when explicitly enabled', async () => {
    process.env.SEARXNG_PUBLIC_INSTANCES_ENABLED = 'true'
    process.env.SEARXNG_PUBLIC_INSTANCE_LIMIT = '2'

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          instances: {
            'http://insecure.example': { network_type: 'normal' },
            'https://localhost:8080': { network_type: 'normal' },
            'https://bad.example': {
              network_type: 'normal',
              api: { error: 'disabled' }
            },
            'https://good.example': { network_type: 'normal' }
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          query: 'morphic',
          number_of_results: 1,
          results: [
            {
              title: 'Morphic',
              url: 'https://www.morphic.sh/',
              content: 'Open-source AI search engine.',
              img_src: ''
            }
          ]
        })
      })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const provider = new QwantSearchProvider()
    const results = await provider.search('morphic', 10, 'basic', [], [])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://searx.space/data/instances.json'
    )
    const searchUrl = new URL(fetchMock.mock.calls[1][0])
    expect(searchUrl.origin).toBe('https://good.example')
    expect(searchUrl.searchParams.get('engines')).toBe('qwant')
    expect(results.results[0]?.url).toBe('https://www.morphic.sh/')
  })
})

describe('DuckDuckGoSearchProvider', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
    delete process.env.SEARXNG_API_URL
    delete process.env.SEARXNG_PUBLIC_INSTANCES_ENABLED
    delete process.env.SEARXNG_PUBLIC_INSTANCES
    clearPublicSearXNGInstanceCache()
  })

  it('routes searches through the DuckDuckGo engine in SearXNG', async () => {
    process.env.SEARXNG_API_URL = 'http://localhost:18080'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: 'morphic github',
        number_of_results: 1,
        results: [
          {
            title: 'Morphic GitHub',
            url: 'https://github.com/miurla/morphic',
            content: 'An AI-powered search engine.',
            img_src: ''
          }
        ]
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const provider = new DuckDuckGoSearchProvider()
    const results = await provider.search('morphic github', 10, 'basic', [], [])

    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.get('engines')).toBe('duckduckgo')
    expect(results.results[0]?.url).toBe('https://github.com/miurla/morphic')
  })

  it('uses DuckDuckGo Instant Answers directly when SearXNG is not configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          Heading: 'Morphic',
          AbstractText: 'Morphic is an open-source AI search engine.',
          AbstractURL: 'https://www.morphic.sh/',
          RelatedTopics: [
            {
              Text: 'Morphic GitHub - Source code for Morphic',
              FirstURL: 'https://github.com/miurla/morphic'
            }
          ]
        })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const provider = new DuckDuckGoSearchProvider()
    const results = await provider.search('morphic', 10, 'basic', [], [])

    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.origin).toBe('https://api.duckduckgo.com')
    expect(url.searchParams.get('format')).toBe('json')
    expect(results.results.map(result => result.url)).toEqual([
      'https://www.morphic.sh/',
      'https://github.com/miurla/morphic'
    ])
    expect(results.warnings?.[0]).toContain('Instant Answer API')
  })

  it('falls back to DuckDuckGo Instant Answers when local SearXNG is unavailable', async () => {
    process.env.SEARXNG_API_URL = 'http://localhost:18080'
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            Heading: 'Morphic',
            AbstractText: 'Morphic answer.',
            AbstractURL: 'https://www.morphic.sh/',
            RelatedTopics: []
          })
      })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const provider = new DuckDuckGoSearchProvider()
    const results = await provider.search('morphic', 10, 'basic', [], [])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new URL(fetchMock.mock.calls[0][0]).origin).toBe(
      'http://localhost:18080'
    )
    expect(new URL(fetchMock.mock.calls[1][0]).origin).toBe(
      'https://api.duckduckgo.com'
    )
    expect(results.results[0]?.url).toBe('https://www.morphic.sh/')
  })

  it('returns a degraded result when DuckDuckGo Instant Answers is empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => ''
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const provider = new DuckDuckGoSearchProvider()
    const results = await provider.search('morphic', 10, 'basic', [], [])

    expect(results.degraded).toBe(true)
    expect(results.results).toEqual([])
    expect(results.warnings?.[0]).toContain('empty response')
  })

  it('returns a degraded result when DuckDuckGo Instant Answers returns invalid JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '{'
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const provider = new DuckDuckGoSearchProvider()
    const results = await provider.search('morphic', 10, 'basic', [], [])

    expect(results.degraded).toBe(true)
    expect(results.results).toEqual([])
    expect(results.warnings?.[0]).toContain('invalid JSON response')
  })
})
