import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isAllowedAuthRedirect, isInternalUrl, openUrl } from '../open-url'
import { _resetRuntimeCache } from '../runtime'

describe('isInternalUrl', () => {
  it('returns true for app origin URLs', () => {
    expect(isInternalUrl('https://morphic.sh/search')).toBe(true)
    expect(isInternalUrl('https://www.morphic.sh/settings')).toBe(true)
  })

  it('returns true for relative paths', () => {
    expect(isInternalUrl('/search/123')).toBe(true)
    expect(isInternalUrl('/')).toBe(true)
  })

  it('returns false for external URLs', () => {
    expect(isInternalUrl('https://google.com')).toBe(false)
    expect(isInternalUrl('https://evil.com/morphic.sh')).toBe(false)
  })
})

describe('isAllowedAuthRedirect', () => {
  it('allows redirects to app origin', () => {
    expect(isAllowedAuthRedirect('https://morphic.sh/auth/oauth')).toBe(true)
    expect(isAllowedAuthRedirect('https://www.morphic.sh/')).toBe(true)
  })

  it('allows relative paths', () => {
    expect(isAllowedAuthRedirect('/')).toBe(true)
    expect(isAllowedAuthRedirect('/auth/login')).toBe(true)
  })

  it('rejects external origins', () => {
    expect(isAllowedAuthRedirect('https://evil.com/steal-token')).toBe(false)
    expect(isAllowedAuthRedirect('https://morphic.sh.evil.com/')).toBe(false)
  })
})

describe('openUrl', () => {
  beforeEach(() => {
    _resetRuntimeCache()
    vi.stubGlobal('window', {
      open: vi.fn(),
      matchMedia: () => ({ matches: false }),
      Capacitor: undefined
    })
    vi.stubGlobal('navigator', {})
  })

  afterEach(() => {
    _resetRuntimeCache()
    vi.unstubAllGlobals()
  })

  it('rejects javascript: scheme', async () => {
    const result = await openUrl('javascript:alert(1)')
    expect(result.opened).toBe(false)
    expect((result as any).reason).toContain('Blocked scheme')
  })

  it('rejects data: scheme', async () => {
    const result = await openUrl('data:text/html,<script>alert(1)</script>')
    expect(result.opened).toBe(false)
    expect((result as any).reason).toContain('Blocked scheme')
  })

  it('rejects file: scheme', async () => {
    const result = await openUrl('file:///etc/passwd')
    expect(result.opened).toBe(false)
    expect((result as any).reason).toContain('Blocked scheme')
  })

  it('returns in-app for internal URLs', async () => {
    const result = await openUrl('https://morphic.sh/search/123')
    expect(result.opened).toBe(true)
    expect((result as any).method).toBe('in-app')
  })

  it('opens external URLs in new tab on web', async () => {
    const mockOpen = vi.fn()
    vi.stubGlobal('window', {
      open: mockOpen,
      matchMedia: () => ({ matches: false })
    })

    const result = await openUrl('https://example.com/page')
    expect(result.opened).toBe(true)
    expect((result as any).method).toBe('new-tab')
    expect(mockOpen).toHaveBeenCalledWith(
      'https://example.com/page',
      '_blank',
      'noopener,noreferrer'
    )
  })

  it('rejects unsupported schemes', async () => {
    const result = await openUrl('ftp://files.example.com/doc.pdf')
    expect(result.opened).toBe(false)
    expect((result as any).reason).toContain('Unsupported scheme')
  })

  it('allows mailto: scheme', async () => {
    const result = await openUrl('mailto:hello@morphic.sh')
    expect(result.opened).toBe(true)
  })

  it('allows tel: scheme', async () => {
    const result = await openUrl('tel:+15551234567')
    expect(result.opened).toBe(true)
  })
})
