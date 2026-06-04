import { beforeEach, describe, expect, it, vi } from 'vitest'

const cookieGetMock = vi.hoisted(() => vi.fn())

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: cookieGetMock
  }))
}))

import { WOLFRAM_ALPHA_APP_ID_COOKIE } from '@/lib/config/wolfram-alpha'

import { DELETE, GET, POST } from '../route'

const originalAppId = process.env.WOLFRAM_ALPHA_APP_ID

beforeEach(() => {
  cookieGetMock.mockReset()
  process.env.WOLFRAM_ALPHA_APP_ID = originalAppId
})

describe('Wolfram|Alpha AppID settings route', () => {
  it('reports environment fallback without exposing the raw AppID', async () => {
    process.env.WOLFRAM_ALPHA_APP_ID = 'environment-app-id'

    const response = await GET()
    const payload = await response.json()

    expect(payload).toEqual({
      hasUserAppId: false,
      hasEnvironmentAppId: true,
      maskedUserAppId: null,
      source: 'environment'
    })
    expect(JSON.stringify(payload)).not.toContain('environment-app-id')
  })

  it('reports a configured user AppID using only a masked value', async () => {
    process.env.WOLFRAM_ALPHA_APP_ID = 'environment-app-id'
    cookieGetMock.mockReturnValue({ value: 'user-app-id' })

    const response = await GET()
    const payload = await response.json()

    expect(payload).toMatchObject({
      hasUserAppId: true,
      hasEnvironmentAppId: true,
      maskedUserAppId: 'user...p-id',
      source: 'user'
    })
    expect(JSON.stringify(payload)).not.toContain('user-app-id')
  })

  it('stores a valid AppID in an HttpOnly cookie', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/wolfram-alpha/app-id', {
        method: 'POST',
        body: JSON.stringify({ appId: 'new-user-app-id' })
      })
    )
    const payload = await response.json()
    const setCookie = response.headers.get('set-cookie') || ''

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      hasUserAppId: true,
      maskedUserAppId: 'new-...p-id',
      source: 'user'
    })
    expect(setCookie).toContain(WOLFRAM_ALPHA_APP_ID_COOKIE)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=lax')
    expect(setCookie).not.toContain('Secure')
  })

  it('rejects invalid AppIDs', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/wolfram-alpha/app-id', {
        method: 'POST',
        body: JSON.stringify({ appId: 'not valid!' })
      })
    )

    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('valid Wolfram|Alpha AppID')
    })
    expect(response.status).toBe(400)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('clears the user AppID cookie', async () => {
    const response = await DELETE()
    const payload = await response.json()
    const setCookie = response.headers.get('set-cookie') || ''

    expect(payload.source).toBe(
      process.env.WOLFRAM_ALPHA_APP_ID ? 'environment' : 'none'
    )
    expect(setCookie).toContain(WOLFRAM_ALPHA_APP_ID_COOKIE)
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })
})
