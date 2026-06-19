/**
 * Secure storage interface contract and stubs.
 *
 * This module defines the secure storage API for native platforms.
 * Currently all functions are no-op stubs because no Keychain/Keystore
 * plugin is installed yet.
 *
 * Implementation requires:
 * 1. Threat model acceptance (docs/SECURE_STORAGE_THREAT_MODEL.md)
 * 2. Plugin installation and NATIVE_SAFETY.md update
 * 3. iOS Keychain / Android Keystore configuration
 *
 * Security constraints:
 * - Only allowlisted keys can be stored (compile-time enforcement)
 * - All user data cleared on logout
 * - No auth tokens stored (cookies are the mechanism)
 * - No user content or PII stored
 */

import { getRuntime } from './runtime'

/**
 * Allowlisted secure storage keys.
 * Adding a new key requires updating this array AND the threat model doc.
 * The type is derived from this array so runtime iteration is possible.
 */
export const ALLOWED_SECURE_KEYS = [
  'device_preference_id',
  'push_device_token',
  'biometric_enabled'
] as const

export type AllowedSecureKey = (typeof ALLOWED_SECURE_KEYS)[number]

/**
 * Get a value from secure storage.
 *
 * Returns null if:
 * - Key is not in the allowlist (compile-time enforced)
 * - Key doesn't exist in storage
 * - Secure storage is not available (web, SSR)
 */
export async function getSecureValue(
  _key: AllowedSecureKey
): Promise<string | null> {
  if (!isSecureStorageAvailable()) return null
  // Stub: will use Capacitor secure storage plugin when installed
  return null
}

/**
 * Set a value in secure storage.
 *
 * Returns false if secure storage is not available.
 * Only allowlisted keys are accepted (enforced at type level).
 */
export async function setSecureValue(
  _key: AllowedSecureKey,
  _value: string
): Promise<boolean> {
  if (!isSecureStorageAvailable()) return false
  // Stub: will use Capacitor secure storage plugin when installed
  return false
}

/**
 * Delete a specific key from secure storage.
 */
export async function deleteSecureValue(
  _key: AllowedSecureKey
): Promise<boolean> {
  if (!isSecureStorageAvailable()) return false
  // Stub: will use Capacitor secure storage plugin when installed
  return false
}

/**
 * Delete ALL user-specific secure storage entries.
 *
 * MUST be called on logout. Clears all allowlisted keys.
 * This is a critical security operation — failure should block logout completion.
 */
export async function clearAllSecureData(): Promise<void> {
  if (!isSecureStorageAvailable()) return
  // Stub: will iterate all AllowedSecureKey values and delete each
}

/**
 * Check if secure storage is available on the current platform.
 *
 * Returns true only when:
 * 1. Running in Capacitor (native iOS/Android)
 * 2. The secure storage plugin is actually registered
 *
 * Returns false on web, SSR, PWA, and when the plugin is not installed.
 */
export function isSecureStorageAvailable(): boolean {
  const runtime = getRuntime()
  if (!runtime.isCapacitor) return false

  // Check if the secure storage plugin is actually registered
  if (typeof window === 'undefined') return false
  const cap = (window as any).Capacitor
  if (!cap || typeof cap.Plugins !== 'object') return false
  return (
    typeof cap.Plugins.SecureStorage === 'object' &&
    cap.Plugins.SecureStorage !== null
  )
}

/**
 * Check for orphaned keys on first launch after reinstall.
 *
 * iOS Keychain persists across app uninstall/reinstall.
 * If no active session exists, all orphaned keys should be deleted.
 */
export async function clearOrphanedKeysIfNeeded(
  hasActiveSession: boolean
): Promise<void> {
  if (hasActiveSession) return
  if (!isSecureStorageAvailable()) return
  // Stub: will check each key and delete if no session exists
  await clearAllSecureData()
}
