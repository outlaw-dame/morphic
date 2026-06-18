import { describe, expect, it } from 'vitest'

import { parseDeepLink, resolveDeepLink } from '../deep-links'

describe('parseDeepLink', () => {
  it('accepts valid home deep link', () => {
    const result = parseDeepLink('https://morphic.sh/')
    expect(result.valid).toBe(true)
    expect(result.path).toBe('/')
    expect(result.requiresAuth).toBe(false)
  })

  it('accepts valid search result deep link', () => {
    const result = parseDeepLink('https://morphic.sh/search/abc123')
    expect(result.valid).toBe(true)
    expect(result.path).toBe('/search/abc123')
    expect(result.requiresAuth).toBe(false)
  })

  it('accepts discovery route', () => {
    const result = parseDeepLink('https://morphic.sh/discovery')
    expect(result.valid).toBe(true)
    expect(result.path).toBe('/discovery')
  })

  it('marks library as requiring auth', () => {
    const result = parseDeepLink('https://morphic.sh/library')
    expect(result.valid).toBe(true)
    expect(result.requiresAuth).toBe(true)
  })

  it('marks settings as requiring auth', () => {
    const result = parseDeepLink('https://morphic.sh/settings')
    expect(result.valid).toBe(true)
    expect(result.requiresAuth).toBe(true)
  })

  it('rejects unknown hosts', () => {
    const result = parseDeepLink('https://evil.com/search')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('Unknown host')
    expect(result.fallback).toBe('reject')
  })

  it('rejects non-https schemes', () => {
    const result = parseDeepLink('http://morphic.sh/search')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('Unsupported scheme')
  })

  it('rejects unknown routes', () => {
    const result = parseDeepLink('https://morphic.sh/admin/secret')
    expect(result.valid).toBe(false)
    expect(result.fallback).toBe('not-found')
    expect(result.reason).toContain('Unknown route')
  })

  it('strips unsafe redirect parameters', () => {
    const result = parseDeepLink(
      'https://morphic.sh/search?q=hello&redirect=https://evil.com'
    )
    expect(result.valid).toBe(true)
    expect(result.path).toBe('/search?q=hello')
    expect(result.path).not.toContain('redirect')
  })

  it('preserves safe query parameters', () => {
    const result = parseDeepLink('https://morphic.sh/search?q=test&page=2')
    expect(result.valid).toBe(true)
    expect(result.path).toContain('q=test')
    expect(result.path).toContain('page=2')
  })

  it('rejects invalid URL format', () => {
    const result = parseDeepLink('not a url at all')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('Invalid URL')
  })

  it('normalizes trailing slashes', () => {
    const result = parseDeepLink('https://morphic.sh/discovery/')
    expect(result.valid).toBe(true)
    expect(result.path).toBe('/discovery')
  })

  it('accepts www subdomain', () => {
    const result = parseDeepLink('https://www.morphic.sh/search')
    expect(result.valid).toBe(true)
    expect(result.path).toBe('/search')
  })

  it('accepts auth/oauth callback route', () => {
    const result = parseDeepLink('https://morphic.sh/auth/oauth')
    expect(result.valid).toBe(true)
    expect(result.path).toBe('/auth/oauth')
    expect(result.requiresAuth).toBe(false)
  })

  it('accepts auth/confirm route', () => {
    const result = parseDeepLink('https://morphic.sh/auth/confirm')
    expect(result.valid).toBe(true)
    expect(result.requiresAuth).toBe(false)
  })
})

describe('resolveDeepLink', () => {
  it('navigates directly for valid public routes', () => {
    const result = resolveDeepLink('https://morphic.sh/discovery', {
      isAuthenticated: false
    })
    expect(result.navigate).toBe('/discovery')
  })

  it('redirects to login for auth-required routes when unauthenticated', () => {
    const result = resolveDeepLink('https://morphic.sh/library', {
      isAuthenticated: false
    })
    expect(result.navigate).toContain('/auth/login')
    expect(result.navigate).toContain('next=%2Flibrary')
    expect(result.reason).toBe('Authentication required')
  })

  it('navigates directly for auth-required routes when authenticated', () => {
    const result = resolveDeepLink('https://morphic.sh/settings', {
      isAuthenticated: true
    })
    expect(result.navigate).toBe('/settings')
  })

  it('falls back to home for unknown routes', () => {
    const result = resolveDeepLink('https://morphic.sh/nonexistent', {
      isAuthenticated: true
    })
    expect(result.navigate).toBe('/')
    expect(result.reason).toContain('Unknown route')
  })

  it('falls back to home for rejected links', () => {
    const result = resolveDeepLink('https://evil.com/phish', {
      isAuthenticated: true
    })
    expect(result.navigate).toBe('/')
  })
})
