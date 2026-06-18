/**
 * Local data classification — defines what can be stored client-side.
 *
 * Data classes:
 * - SAFE_PREFERENCE: Non-sensitive UX preferences (theme, last tab, etc.)
 * - USER_DRAFT: User-controlled draft content (survives reload, deletable)
 * - CACHEABLE_METADATA: Public metadata that can be cached (stale-labeled)
 * - SENSITIVE_FORBIDDEN: Must NEVER be stored locally
 *
 * This module enforces the boundary between what the app is allowed to
 * persist locally vs what must remain server-side only.
 */

export type DataClassification =
  | 'safe_preference'
  | 'user_draft'
  | 'cacheable_metadata'
  | 'sensitive_forbidden'

export interface DataClassificationRule {
  key: string
  classification: DataClassification
  description: string
  /** Maximum age in ms before data is considered stale (cacheable_metadata only) */
  maxAge?: number
}

/**
 * Registry of known local storage keys and their classifications.
 *
 * Any key not in this registry is treated as SENSITIVE_FORBIDDEN by default.
 */
const DATA_REGISTRY: DataClassificationRule[] = [
  // Safe preferences
  {
    key: 'theme',
    classification: 'safe_preference',
    description: 'Color theme preference'
  },
  {
    key: 'platform-overrides',
    classification: 'safe_preference',
    description: 'Platform UI overrides'
  },
  {
    key: 'last-active-tab',
    classification: 'safe_preference',
    description: 'Last visited tab index'
  },
  {
    key: 'sidebar-collapsed',
    classification: 'safe_preference',
    description: 'Sidebar open/closed state'
  },
  {
    key: 'notification-preferences-local',
    classification: 'safe_preference',
    description: 'Local notification category toggles'
  },
  {
    key: 'reduced-motion-override',
    classification: 'safe_preference',
    description: 'Motion preference override'
  },

  // User drafts
  {
    key: 'search-draft',
    classification: 'user_draft',
    description: 'Unsent search query draft'
  },
  {
    key: 'feedback-draft',
    classification: 'user_draft',
    description: 'Unsent feedback form draft'
  },

  // Cacheable metadata
  {
    key: 'models-cache',
    classification: 'cacheable_metadata',
    description: 'Available model list',
    maxAge: 60 * 60 * 1000
  }, // 1 hour
  {
    key: 'discovery-cache',
    classification: 'cacheable_metadata',
    description: 'Discovery feed metadata',
    maxAge: 15 * 60 * 1000
  } // 15 min
]

/**
 * Classify a storage key.
 *
 * Unknown keys are treated as sensitive_forbidden by default (deny-by-default).
 */
export function classifyKey(key: string): DataClassification {
  const rule = DATA_REGISTRY.find(r => r.key === key)
  return rule?.classification ?? 'sensitive_forbidden'
}

/**
 * Check if a key is allowed to be stored locally.
 */
export function isAllowedLocalStorage(key: string): boolean {
  const classification = classifyKey(key)
  return classification !== 'sensitive_forbidden'
}

/**
 * Check if cached data is stale based on its classification.
 */
export function isCacheStale(key: string, storedAt: number): boolean {
  const rule = DATA_REGISTRY.find(r => r.key === key)
  if (!rule || rule.classification !== 'cacheable_metadata') return true
  if (!rule.maxAge) return false
  return Date.now() - storedAt > rule.maxAge
}

/**
 * Get the full data registry for documentation/debugging.
 */
export function getDataRegistry(): DataClassificationRule[] {
  return [...DATA_REGISTRY]
}

/**
 * Keys that must be cleared on logout.
 *
 * Drafts and cached metadata are user-specific and should not
 * persist across account boundaries.
 */
export function getLogoutClearKeys(): string[] {
  return DATA_REGISTRY.filter(
    r =>
      r.classification === 'user_draft' ||
      r.classification === 'cacheable_metadata'
  ).map(r => r.key)
}

/**
 * Keys that can survive a logout (device-level preferences).
 */
export function getDevicePreferenceKeys(): string[] {
  return DATA_REGISTRY.filter(r => r.classification === 'safe_preference').map(
    r => r.key
  )
}
