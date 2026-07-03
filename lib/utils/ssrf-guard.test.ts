import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { lookupMock } = vi.hoisted(() => ({
  lookupMock: vi.fn()
}))

vi.mock('node:dns', () => ({
  default: {
    promises: {
      lookup: lookupMock
    }
  }
}))

import {
  readResponseWithLimit,
  safeFetch,
  SSRFError,
  validateOutboundUrl
} from './ssrf-guard'

describe('SSRF guard network paths', () => {
  beforeEach(() => {
    lookupMock.mockReset()
    lookupMock.mockResolvedValue([{ address: '93.184.216.34' }])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('blocks private IP literals before DNS or fetch', async () => {
    await expect(validateOutboundUrl('http://127.0.0.1/admin')).rejects.toMatchObject({
      name: 'SSRFError',
      reason: 'Blocked IP: 127.0.0.1'
    })
    expect(lookupMock).not.toHaveBeenCalled()
  })

  it('blocks known internal hostnames before fetch', async () => {
    await expect(validateOutboundUrl('http://localhost:3000')).rejects.toMatchObject({
      name: 'SSRFError',
      reason: 'Blocked hostname: localhost'
    })
    expect(lookupMock).not.toHaveBeenCalled()
  })

  it('revalidates redirects and blocks redirects to private IPs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('', {
        status: 302,
        headers: {
          location: 'http://127.0.0.1/private'
        }
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(safeFetch('https://example.com/start')).rejects.toMatchObject({
      name: 'SSRFError',
      reason: 'Blocked IP: 127.0.0.1'
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects oversized responses from content-length before reading the body', async () => {
    const response = new Response('abcdef', {
      headers: {
        'content-length': '6'
      }
    })

    await expect(readResponseWithLimit(response, 3)).rejects.toBeInstanceOf(SSRFError)
  })

  it('rejects streamed responses that exceed the byte cap while reading', async () => {
    const response = new Response('abcdef')

    await expect(readResponseWithLimit(response, 3)).rejects.toMatchObject({
      name: 'SSRFError',
      reason: 'Response exceeded size limit: 6+ bytes (limit: 3)'
    })
  })
})
