import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkSafeBrowsingUrl } from './safe-browsing'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('checkSafeBrowsingUrl', () => {
  it('checks destinations through the same-origin Safe Browsing route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          safe: false,
          checked: true,
          threatTypes: ['MALWARE']
        }),
        { status: 200 }
      )
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await checkSafeBrowsingUrl('https://unsafe.example.org')

    expect(result).toMatchObject({
      safe: false,
      checked: true,
      threatTypes: ['MALWARE']
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/safe-browsing',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: 'https://unsafe.example.org/' })
      })
    )
  })

  it('fails open if the proxy cannot be reached', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 })
    ) as unknown as typeof fetch

    await expect(
      checkSafeBrowsingUrl(`https://unavailable-${Date.now()}.example.org`)
    ).resolves.toMatchObject({
      safe: true,
      checked: false,
      reason: 'proxy_error'
    })
  })
})
