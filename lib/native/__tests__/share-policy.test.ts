import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetRuntimeCache } from '../runtime'
import {
  buildSearchShareData,
  buildSearchShareUrl,
  validateShareContent
} from '../share-policy'

describe('validateShareContent', () => {
  beforeEach(() => {
    _resetRuntimeCache()
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('navigator', {})
  })

  afterEach(() => {
    _resetRuntimeCache()
    vi.unstubAllGlobals()
  })

  it('allows sharing a valid internal URL', () => {
    const result = validateShareContent({
      title: 'My search',
      url: 'https://morphic.sh/search/abc123'
    })
    expect(result.allowed).toBe(true)
    expect(result.sanitizedData?.url).toBe('https://morphic.sh/search/abc123')
  })

  it('allows sharing external HTTPS URLs', () => {
    const result = validateShareContent({
      url: 'https://example.com/article'
    })
    expect(result.allowed).toBe(true)
  })

  it('rejects non-HTTPS external URLs', () => {
    const result = validateShareContent({
      url: 'http://insecure.com/page'
    })
    expect(result.allowed).toBe(false)
  })

  it('rejects content with API key patterns', () => {
    const result = validateShareContent({
      text: 'Check this: sk-abcdefghij1234567890abcd'
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('sensitive data')
  })

  it('rejects content with Bearer tokens', () => {
    const result = validateShareContent({
      text: 'Auth: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig'
    })
    expect(result.allowed).toBe(false)
  })

  it('rejects URLs with sensitive query params', () => {
    const result = validateShareContent({
      url: 'https://example.com/api?access_token=secret123'
    })
    expect(result.allowed).toBe(false)
  })

  it('rejects internal URLs with sensitive query params', () => {
    const result = validateShareContent({
      url: 'https://morphic.sh/auth/callback?access_token=xyz'
    })
    expect(result.allowed).toBe(false)
  })

  it('rejects URLs with sensitive hash fragments', () => {
    const result = validateShareContent({
      url: 'https://morphic.sh/login#access_token=leaked'
    })
    expect(result.allowed).toBe(false)
  })

  it('truncates overly long text', () => {
    const longText = 'a'.repeat(5000)
    const result = validateShareContent({ text: longText })
    expect(result.allowed).toBe(true)
    expect(result.sanitizedData?.text?.length).toBe(2000)
  })

  it('truncates overly long titles', () => {
    const longTitle = 'T'.repeat(500)
    const result = validateShareContent({ title: longTitle })
    expect(result.allowed).toBe(true)
    expect(result.sanitizedData?.title?.length).toBe(200)
  })

  it('allows plain text without URLs', () => {
    const result = validateShareContent({
      title: 'Interesting result',
      text: 'Check out what I found about quantum computing'
    })
    expect(result.allowed).toBe(true)
  })
})

describe('buildSearchShareUrl', () => {
  it('builds correct public URL', () => {
    expect(buildSearchShareUrl('abc123')).toBe(
      'https://morphic.sh/search/abc123'
    )
  })

  it('encodes special characters in ID', () => {
    const url = buildSearchShareUrl('id with spaces')
    expect(url).toContain('id%20with%20spaces')
  })
})

describe('buildSearchShareData', () => {
  it('returns title and URL', () => {
    const data = buildSearchShareData('abc123', 'My search result')
    expect(data.title).toBe('My search result')
    expect(data.url).toBe('https://morphic.sh/search/abc123')
  })

  it('uses default title when none provided', () => {
    const data = buildSearchShareData('abc123')
    expect(data.title).toContain('Morphic')
  })
})
