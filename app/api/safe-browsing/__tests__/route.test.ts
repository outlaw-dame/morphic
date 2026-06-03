import { afterEach, describe, expect, it, vi } from 'vitest'

import { POST } from '../route'

const originalFetch = globalThis.fetch
const originalApiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY

afterEach(() => {
  globalThis.fetch = originalFetch
  process.env.GOOGLE_SAFE_BROWSING_API_KEY = originalApiKey
  vi.restoreAllMocks()
})

describe('Safe Browsing API route', () => {
  it('fails open when the Google Safe Browsing key is not configured', async () => {
    delete process.env.GOOGLE_SAFE_BROWSING_API_KEY

    const response = await POST(
      new Request('http://localhost:3000/api/safe-browsing', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.org' })
      })
    )

    await expect(response.json()).resolves.toMatchObject({
      safe: true,
      checked: false,
      reason: 'not_configured'
    })
  })

  it('sends URL threat checks to Google Safe Browsing', async () => {
    process.env.GOOGLE_SAFE_BROWSING_API_KEY = 'safe-browsing-test-key'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200
      })
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await POST(
      new Request('http://localhost:3000/api/safe-browsing', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.org/path' })
      })
    )
    const payload = await response.json()

    expect(payload).toMatchObject({
      safe: true,
      checked: true,
      threatTypes: []
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://safebrowsing.googleapis.com/v4/threatMatches:find?key='
      ),
      expect.objectContaining({
        method: 'POST',
        redirect: 'error'
      })
    )

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.threatInfo).toMatchObject({
      threatTypes: [
        'MALWARE',
        'SOCIAL_ENGINEERING',
        'UNWANTED_SOFTWARE',
        'POTENTIALLY_HARMFUL_APPLICATION'
      ],
      platformTypes: ['ANY_PLATFORM'],
      threatEntryTypes: ['URL'],
      threatEntries: [{ url: 'https://example.org/path' }]
    })
  })

  it('marks URLs unsafe when Google returns threat matches', async () => {
    process.env.GOOGLE_SAFE_BROWSING_API_KEY = 'safe-browsing-test-key'
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          matches: [{ threatType: 'SOCIAL_ENGINEERING' }]
        }),
        { status: 200 }
      )
    ) as unknown as typeof fetch

    const response = await POST(
      new Request('http://localhost:3000/api/safe-browsing', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://phishing.example.org' })
      })
    )

    await expect(response.json()).resolves.toMatchObject({
      safe: false,
      checked: true,
      threatTypes: ['SOCIAL_ENGINEERING']
    })
  })
})
