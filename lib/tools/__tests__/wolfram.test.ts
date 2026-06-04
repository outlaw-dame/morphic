import { afterEach, describe, expect, test, vi } from 'vitest'

const cookieGetMock = vi.hoisted(() => vi.fn())

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: cookieGetMock
  }))
}))

import { queryWolframAlpha } from '../wolfram'

const originalFetch = globalThis.fetch
const originalAppId = process.env.WOLFRAM_ALPHA_APP_ID

afterEach(() => {
  globalThis.fetch = originalFetch
  process.env.WOLFRAM_ALPHA_APP_ID = originalAppId
  cookieGetMock.mockReset()
  vi.restoreAllMocks()
})

describe('queryWolframAlpha', () => {
  test('queries the Full Results API and parses plaintext pods', async () => {
    process.env.WOLFRAM_ALPHA_APP_ID = 'test-app-id'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          queryresult: {
            success: true,
            error: false,
            pods: [
              {
                id: 'Input',
                title: 'Input interpretation',
                primary: false,
                subpods: [{ plaintext: 'integral of sin^2(x)' }]
              },
              {
                id: 'Result',
                title: 'Result',
                primary: true,
                subpods: [{ plaintext: '1/2 (x - sin(x) cos(x)) + constant' }]
              }
            ],
            sources: {
              source: {
                text: 'Mathematical functions',
                url: 'https://www.wolframalpha.com/sources/'
              }
            }
          }
        }),
        { status: 200 }
      )
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await queryWolframAlpha({
      query: 'integrate sin(x)^2',
      mode: 'full',
      units: 'metric',
      location: 'Chicago, IL'
    })

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(requestUrl.origin + requestUrl.pathname).toBe(
      'https://api.wolframalpha.com/v2/query'
    )
    expect(requestUrl.searchParams.get('appid')).toBe('test-app-id')
    expect(requestUrl.searchParams.get('input')).toBe('integrate sin(x)^2')
    expect(requestUrl.searchParams.get('output')).toBe('json')
    expect(requestUrl.searchParams.get('format')).toBe('plaintext')
    expect(requestUrl.searchParams.get('units')).toBe('metric')
    expect(requestUrl.searchParams.get('location')).toBe('Chicago, IL')
    expect(result.answer).toBe('1/2 (x - sin(x) cos(x)) + constant')
    expect(result.pods).toHaveLength(2)
    expect(result.sources[0]?.text).toBe('Mathematical functions')
  })

  test('queries the Short Answers API for concise answers', async () => {
    process.env.WOLFRAM_ALPHA_APP_ID = 'test-app-id'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('3966 kilometers', { status: 200 })
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await queryWolframAlpha({
      query: 'distance from Los Angeles to New York',
      mode: 'short',
      units: 'metric'
    })

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(requestUrl.origin + requestUrl.pathname).toBe(
      'https://api.wolframalpha.com/v1/result'
    )
    expect(requestUrl.searchParams.get('appid')).toBe('test-app-id')
    expect(requestUrl.searchParams.get('i')).toBe(
      'distance from Los Angeles to New York'
    )
    expect(requestUrl.searchParams.get('units')).toBe('metric')
    expect(result.answer).toBe('3966 kilometers')
    expect(result.pods[0]?.id).toBe('ShortAnswer')
  })

  test('prefers a user AppID from the secure settings cookie', async () => {
    process.env.WOLFRAM_ALPHA_APP_ID = 'environment-app-id'
    cookieGetMock.mockReturnValue({ value: 'user-app-id' })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('42', { status: 200 })
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await queryWolframAlpha({ query: 'meaning of life', mode: 'short' })

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(requestUrl.searchParams.get('appid')).toBe('user-app-id')
  })

  test('fails closed when no AppID is configured', async () => {
    delete process.env.WOLFRAM_ALPHA_APP_ID

    await expect(
      queryWolframAlpha({ query: '2+2', mode: 'short' })
    ).rejects.toThrow('WOLFRAM_ALPHA_APP_ID')
  })
})
