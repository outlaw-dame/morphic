/**
 * Push notification bridge — interface contract and no-op stubs.
 *
 * This module defines the client-side push notification API.
 * Currently all functions are no-ops (stubs) because the Capacitor
 * push-notifications plugin is not yet installed.
 *
 * Implementation will be added after:
 * 1. Architecture review (docs/PUSH_NOTIFICATION_ARCHITECTURE.md)
 * 2. Server-side token model (database migration)
 * 3. Plugin installation and safety review
 *
 * All functions are safe to call on any platform — they no-op on web.
 */

import { getRuntime } from './runtime'

export type NotificationCategory =
  | 'search_complete'
  | 'saved_update'
  | 'system_alert'
  | 'account_security'

export interface PushTokenInfo {
  token: string
  platform: 'ios' | 'android'
  deviceId: string
}

export interface NotificationPreference {
  category: NotificationCategory
  enabled: boolean
  detailedPreview: boolean
}

export type PushPermissionStatus =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unsupported'

/**
 * Check the current push notification permission status.
 *
 * Returns 'unsupported' on web/browser contexts.
 */
export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  const runtime = getRuntime()
  if (!runtime.isCapacitor) return 'unsupported'

  // Stub: will use Capacitor PushNotifications.checkPermissions() when plugin is installed
  return 'unsupported'
}

/**
 * Request push notification permission from the user.
 *
 * Should only be called after a clear user intent (not on first launch).
 * Returns the resulting permission status.
 */
export async function requestPushPermission(): Promise<PushPermissionStatus> {
  const runtime = getRuntime()
  if (!runtime.isCapacitor) return 'unsupported'

  // Stub: will use Capacitor PushNotifications.requestPermissions() when plugin is installed
  return 'unsupported'
}

/**
 * Register the push token with the server.
 *
 * Called after permission is granted and a token is received.
 * No-ops if not in a native context.
 */
export async function registerPushToken(
  _token: PushTokenInfo
): Promise<boolean> {
  const runtime = getRuntime()
  if (!runtime.isCapacitor) return false

  // Stub: will POST to /api/push-token when server endpoint exists
  return false
}

/**
 * Delete the push token from the server.
 *
 * MUST be called on logout to ensure no push token survives a session end.
 */
export async function deletePushToken(): Promise<boolean> {
  const runtime = getRuntime()
  if (!runtime.isCapacitor) return false

  // Stub: will DELETE /api/push-token when server endpoint exists
  return false
}

/**
 * Handle a received notification (while app is in foreground).
 *
 * Checks notification preferences before displaying in-app notification.
 * Accepts optional deepLinkUrl for in-app banner tap navigation.
 */
export function handleNotificationReceived(
  _category: NotificationCategory,
  _title: string,
  _body: string,
  _deepLinkUrl?: string
): void {
  // Stub: will check preferences and show in-app notification when implemented
}

/**
 * Handle a notification tap (app opened from notification).
 *
 * Routes through the deep link parser for safe navigation.
 * Requires authentication status to resolve auth-gated routes.
 */
export function handleNotificationTap(
  _deepLinkUrl: string,
  _options: { isAuthenticated: boolean }
): void {
  // Stub: will call resolveDeepLink(url, { isAuthenticated }) and navigate when implemented
}

/**
 * Default notification preferences for new users.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreference[] = [
  { category: 'search_complete', enabled: true, detailedPreview: false },
  { category: 'saved_update', enabled: true, detailedPreview: false },
  { category: 'system_alert', enabled: true, detailedPreview: false },
  { category: 'account_security', enabled: true, detailedPreview: false }
]
