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
 * Adding a new key requires updating this type AND the threat model doc.
 */
export type AllowedSecureKey =
  | 'device_preference_id'
  | 'push_device_token'
  | 'biometric_enabled'

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
 * Only available on Capacitor (native iOS/Android).
 * Returns false on web, SSR, and PWA.
 */
export function isSecureStorageAvailable(): boolean {
  const runtime = getRuntime()
  return runtime.isCapacitor
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
