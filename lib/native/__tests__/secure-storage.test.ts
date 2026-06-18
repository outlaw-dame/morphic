import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetRuntimeCache } from '../runtime'
import {
  clearAllSecureData,
  clearOrphanedKeysIfNeeded,
  deleteSecureValue,
  getSecureValue,
  isSecureStorageAvailable,
  setSecureValue
} from '../secure-storage'

describe('secure-storage (stub phase)', () => {
  beforeEach(() => {
    _resetRuntimeCache()
  })

  afterEach(() => {
    _resetRuntimeCache()
    vi.unstubAllGlobals()
  })

  it('isSecureStorageAvailable returns false on browser', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('navigator', {})
    expect(isSecureStorageAvailable()).toBe(false)
  })

  it('isSecureStorageAvailable returns true on Capacitor', () => {
    vi.stubGlobal('window', {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
      matchMedia: () => ({ matches: false })
    })
    vi.stubGlobal('navigator', {})
    expect(isSecureStorageAvailable()).toBe(true)
  })

  it('getSecureValue returns null on browser', async () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('navigator', {})
    expect(await getSecureValue('device_preference_id')).toBeNull()
  })

  it('setSecureValue returns false on browser', async () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('navigator', {})
    expect(await setSecureValue('push_device_token', 'abc')).toBe(false)
  })

  it('deleteSecureValue returns false on browser', async () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('navigator', {})
    expect(await deleteSecureValue('biometric_enabled')).toBe(false)
  })

  it('clearAllSecureData does not throw on browser', async () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('navigator', {})
    await expect(clearAllSecureData()).resolves.toBeUndefined()
  })

  it('clearOrphanedKeysIfNeeded does nothing with active session', async () => {
    vi.stubGlobal('window', {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
      matchMedia: () => ({ matches: false })
    })
    vi.stubGlobal('navigator', {})
    // Should not throw
    await expect(clearOrphanedKeysIfNeeded(true)).resolves.toBeUndefined()
  })

  it('clearOrphanedKeysIfNeeded clears data without active session', async () => {
    vi.stubGlobal('window', {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
      matchMedia: () => ({ matches: false })
    })
    vi.stubGlobal('navigator', {})
    // Should not throw (stub just calls clearAllSecureData which is also a stub)
    await expect(clearOrphanedKeysIfNeeded(false)).resolves.toBeUndefined()
  })
})
