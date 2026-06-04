import { beforeEach, describe, expect, it, vi } from 'vitest'

const cookieGetMock = vi.hoisted(() => vi.fn())
const validateOutboundUrlMock = vi.hoisted(() => vi.fn())

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: cookieGetMock
  }))
}))

vi.mock('@/lib/utils/ssrf-guard', () => ({
  validateOutboundUrl: validateOutboundUrlMock
}))

import { FEED_SUBSCRIPTIONS_COOKIE } from '@/lib/config/feed-subscriptions'

import { DELETE, GET, POST } from '../route'

beforeEach(() => {
  cookieGetMock.mockReset()
  validateOutboundUrlMock.mockReset()
  validateOutboundUrlMock.mockResolvedValue(new URL('https://example.com/feed.xml'))
})

describe('feed subscriptions route', () => {
  it('returns saved feed subscriptions', async () => {
    cookieGetMock.mockReturnValue({
      value: encodeURIComponent(
        JSON.stringify([{ url: 'https://example.com/feed.xml' }])
      )
    })

    const response = await GET()

    await expect(response.json()).resolves.toMatchObject({
      feeds: [{ url: 'https://example.com/feed.xml' }],
      maxFeeds: 20
    })
  })

  it('stores a validated feed URL in an HttpOnly cookie', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/feed-subscriptions', {
        method: 'POST',
        body: JSON.stringify({ url: 'example.com/feed.xml' })
      })
    )
    const payload = await response.json()
    const setCookie = response.headers.get('set-cookie') || ''

    expect(response.status).toBe(200)
    expect(validateOutboundUrlMock).toHaveBeenCalledWith(
      'https://example.com/feed.xml'
    )
    expect(payload.feeds).toEqual([{ url: 'https://example.com/feed.xml' }])
    expect(setCookie).toContain(FEED_SUBSCRIPTIONS_COOKIE)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=lax')
  })

  it('rejects unsafe feed URLs', async () => {
    validateOutboundUrlMock.mockRejectedValue(new Error('blocked'))

    const response = await POST(
      new Request('http://localhost:3000/api/feed-subscriptions', {
        method: 'POST',
        body: JSON.stringify({ url: 'http://localhost/feed.xml' })
      })
    )

    await expect(response.json()).resolves.toMatchObject({
      error: 'That feed URL cannot be fetched safely.'
    })
    expect(response.status).toBe(400)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('removes one feed or clears the cookie when no feeds remain', async () => {
    cookieGetMock.mockReturnValue({
      value: encodeURIComponent(
        JSON.stringify([{ url: 'https://example.com/feed.xml' }])
      )
    })

    const response = await DELETE(
      new Request('http://localhost:3000/api/feed-subscriptions', {
        method: 'DELETE',
        body: JSON.stringify({ url: 'https://example.com/feed.xml' })
      })
    )
    const payload = await response.json()
    const setCookie = response.headers.get('set-cookie') || ''

    expect(payload.feeds).toEqual([])
    expect(setCookie).toContain(FEED_SUBSCRIPTIONS_COOKIE)
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })
})
