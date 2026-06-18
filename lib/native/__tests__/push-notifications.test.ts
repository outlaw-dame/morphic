import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  deletePushToken,
  getPushPermissionStatus,
  registerPushToken,
  requestPushPermission
} from '../push-notifications'
import { _resetRuntimeCache } from '../runtime'

describe('push-notifications (stub phase)', () => {
  beforeEach(() => {
    _resetRuntimeCache()
  })

  afterEach(() => {
    _resetRuntimeCache()
    vi.unstubAllGlobals()
  })

  it('returns unsupported on browser runtime', async () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('navigator', {})

    expect(await getPushPermissionStatus()).toBe('unsupported')
    expect(await requestPushPermission()).toBe('unsupported')
  })

  it('registerPushToken returns false on browser', async () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('navigator', {})

    const result = await registerPushToken({
      token: 'abc123',
      platform: 'ios',
      deviceId: 'device-1'
    })
    expect(result).toBe(false)
  })

  it('deletePushToken returns false on browser', async () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('navigator', {})

    expect(await deletePushToken()).toBe(false)
  })

  it('returns unsupported even with Capacitor bridge but no plugin', async () => {
    vi.stubGlobal('window', {
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => 'ios',
        Plugins: {} // No PushNotifications plugin registered
      },
      matchMedia: () => ({ matches: false })
    })
    vi.stubGlobal('navigator', {})

    // Still returns unsupported because the stub doesn't check plugins yet
    expect(await getPushPermissionStatus()).toBe('unsupported')
  })

  it('DEFAULT_NOTIFICATION_PREFERENCES has all categories', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES).toHaveLength(4)
    expect(DEFAULT_NOTIFICATION_PREFERENCES.map(p => p.category)).toEqual([
      'search_complete',
      'saved_update',
      'system_alert',
      'account_security'
    ])
  })

  it('all default preferences have detailedPreview disabled', () => {
    for (const pref of DEFAULT_NOTIFICATION_PREFERENCES) {
      expect(pref.detailedPreview).toBe(false)
    }
  })

  it('all default preferences are enabled', () => {
    for (const pref of DEFAULT_NOTIFICATION_PREFERENCES) {
      expect(pref.enabled).toBe(true)
    }
  })
})
