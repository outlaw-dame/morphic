import { describe, expect, it } from 'vitest'

import {
  classifyKey,
  getDevicePreferenceKeys,
  getLogoutClearKeys,
  isAllowedLocalStorage,
  isCacheStale
} from '../local-data-classification'

describe('classifyKey', () => {
  it('classifies theme as safe_preference', () => {
    expect(classifyKey('theme')).toBe('safe_preference')
  })

  it('classifies search-draft as user_draft', () => {
    expect(classifyKey('search-draft')).toBe('user_draft')
  })

  it('classifies models-cache as cacheable_metadata', () => {
    expect(classifyKey('models-cache')).toBe('cacheable_metadata')
  })

  it('classifies unknown keys as sensitive_forbidden', () => {
    expect(classifyKey('auth-token')).toBe('sensitive_forbidden')
    expect(classifyKey('api-key')).toBe('sensitive_forbidden')
    expect(classifyKey('random-unknown')).toBe('sensitive_forbidden')
  })
})

describe('isAllowedLocalStorage', () => {
  it('returns true for registered keys', () => {
    expect(isAllowedLocalStorage('theme')).toBe(true)
    expect(isAllowedLocalStorage('search-draft')).toBe(true)
    expect(isAllowedLocalStorage('models-cache')).toBe(true)
  })

  it('returns false for unknown keys', () => {
    expect(isAllowedLocalStorage('secret-key')).toBe(false)
    expect(isAllowedLocalStorage('session-token')).toBe(false)
  })
})

describe('isCacheStale', () => {
  it('returns false for fresh cache', () => {
    expect(isCacheStale('models-cache', Date.now() - 1000)).toBe(false)
  })

  it('returns true for expired cache', () => {
    // models-cache maxAge is 1 hour
    expect(isCacheStale('models-cache', Date.now() - 2 * 60 * 60 * 1000)).toBe(
      true
    )
  })

  it('returns true for unknown keys', () => {
    expect(isCacheStale('unknown-key', Date.now())).toBe(true)
  })

  it('returns true for non-cacheable keys', () => {
    expect(isCacheStale('theme', Date.now())).toBe(true)
  })
})

describe('getLogoutClearKeys', () => {
  it('includes user_draft keys with draft: prefix', () => {
    const keys = getLogoutClearKeys()
    expect(keys).toContain('draft:search-draft')
    expect(keys).toContain('draft:feedback-draft')
  })

  it('includes cacheable_metadata keys without prefix', () => {
    const keys = getLogoutClearKeys()
    expect(keys).toContain('models-cache')
    expect(keys).toContain('discovery-cache')
  })

  it('does not include safe_preference keys', () => {
    const keys = getLogoutClearKeys()
    expect(keys).not.toContain('theme')
  })
})

describe('getDevicePreferenceKeys', () => {
  it('includes safe_preference keys', () => {
    const keys = getDevicePreferenceKeys()
    expect(keys).toContain('theme')
    expect(keys).toContain('sidebar-collapsed')
  })

  it('does not include draft or cache keys', () => {
    const keys = getDevicePreferenceKeys()
    expect(keys).not.toContain('search-draft')
    expect(keys).not.toContain('models-cache')
  })
})
