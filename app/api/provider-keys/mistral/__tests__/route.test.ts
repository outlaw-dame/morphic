import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cookieValues = {
  current: new Map<string, string>()
}

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = cookieValues.current.get(name)
      return value ? { name, value } : undefined
    }
  }))
}))

import { DELETE, GET, POST } from '../route'

describe('Mistral provider key API route', () => {
  beforeEach(() => {
    cookieValues.current = new Map()
  })

  afterEach(() => {
    delete process.env.MISTRAL_API_KEY
    delete process.env.MISTRAL_NATIVE_WEB_SEARCH_ENABLED
  })

  it('reports configured state and native search status without returning the key', async () => {
    cookieValues.current.set('mistral_api_key', 'mt-user-key-123456')
    cookieValues.current.set('mistral_native_web_search_enabled', 'true')

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      configured: true,
      source: 'user',
      nativeWebSearchEnabled: true,
      nativeWebSearchSource: 'user'
    })
    expect(JSON.stringify(body)).not.toContain('mt-user-key-123456')
  })

  it('falls back to environment status without exposing the environment key', async () => {
    process.env.MISTRAL_API_KEY = 'mt-env-key-123456'
    process.env.MISTRAL_NATIVE_WEB_SEARCH_ENABLED = 'true'

    const response = await GET()
    const body = await response.json()

    expect(body).toEqual({
      ok: true,
      configured: true,
      source: 'environment',
      nativeWebSearchEnabled: true,
      nativeWebSearchSource: 'environment'
    })
    expect(JSON.stringify(body)).not.toContain('mt-env-key-123456')
  })

  it('sets HttpOnly key and native search preference cookies without echoing the secret', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/provider-keys/mistral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: 'mt-user-key-123456',
          nativeWebSearchEnabled: true
        })
      })
    )
    const body = await response.json()
    const cookie = response.headers.get('set-cookie') || ''

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      configured: true,
      source: 'user',
      nativeWebSearchEnabled: true,
      nativeWebSearchSource: 'user'
    })
    expect(JSON.stringify(body)).not.toContain('mt-user-key-123456')
    expect(cookie).toContain('mistral_api_key=')
    expect(cookie).toContain('mistral_native_web_search_enabled=true')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=lax')
    expect(cookie).toContain('Path=/')
  })

  it('rejects malformed keys', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/provider-keys/mistral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'bad key with spaces' })
      })
    )

    expect(response.status).toBe(400)
  })

  it('updates native search preference using an existing HttpOnly user key', async () => {
    cookieValues.current.set('mistral_api_key', 'mt-user-key-123456')

    const response = await POST(
      new Request('http://localhost:3000/api/provider-keys/mistral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nativeWebSearchEnabled: false })
      })
    )
    const body = await response.json()
    const cookie = response.headers.get('set-cookie') || ''

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      configured: true,
      source: 'user',
      nativeWebSearchEnabled: false,
      nativeWebSearchSource: 'user'
    })
    expect(JSON.stringify(body)).not.toContain('mt-user-key-123456')
    expect(cookie).toContain('mistral_native_web_search_enabled=false')
  })

  it('updates native search preference when only an environment key is configured', async () => {
    process.env.MISTRAL_API_KEY = 'mt-env-key-123456'

    const response = await POST(
      new Request('http://localhost:3000/api/provider-keys/mistral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nativeWebSearchEnabled: true })
      })
    )
    const body = await response.json()
    const cookie = response.headers.get('set-cookie') || ''

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      configured: true,
      source: 'environment',
      nativeWebSearchEnabled: true,
      nativeWebSearchSource: 'user'
    })
    expect(JSON.stringify(body)).not.toContain('mt-env-key-123456')
    expect(cookie).not.toContain('mistral_api_key=')
    expect(cookie).toContain('mistral_native_web_search_enabled=true')
  })

  it('deletes user cookies and keeps environment status', async () => {
    process.env.MISTRAL_API_KEY = 'mt-env-key-123456'

    const response = await DELETE()
    const body = await response.json()
    const cookie = response.headers.get('set-cookie') || ''

    expect(body).toEqual({
      ok: true,
      configured: true,
      source: 'environment',
      nativeWebSearchEnabled: false,
      nativeWebSearchSource: 'default'
    })
    expect(cookie).toContain('mistral_api_key=')
    expect(cookie).toContain('mistral_native_web_search_enabled=')
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain('HttpOnly')
  })
})
