/**
 * Draft persistence — saves and restores user drafts across page reloads.
 *
 * Drafts are:
 * - Stored in localStorage (survives reload)
 * - Explicitly deletable by the user
 * - Cleared on logout (user-specific content)
 * - Never contain sensitive data (validated by classification)
 *
 * Safe for SSR: all operations no-op when localStorage is unavailable.
 */

import { classifyKey } from './local-data-classification'

export interface DraftEntry {
  key: string
  content: string
  savedAt: number
}

/**
 * Save a draft to localStorage.
 *
 * Only saves if the key is classified as 'user_draft'.
 * Returns true if saved successfully.
 */
export function saveDraft(key: string, content: string): boolean {
  if (typeof localStorage === 'undefined') return false
  if (classifyKey(key) !== 'user_draft') return false
  if (!content.trim()) {
    // Empty content → delete the draft
    deleteDraft(key)
    return true
  }

  try {
    const entry: DraftEntry = {
      key,
      content,
      savedAt: Date.now()
    }
    localStorage.setItem(`draft:${key}`, JSON.stringify(entry))
    return true
  } catch {
    return false
  }
}

/**
 * Load a draft from localStorage.
 *
 * Returns null if no draft exists or if the key is not a valid draft key.
 */
export function loadDraft(key: string): DraftEntry | null {
  if (typeof localStorage === 'undefined') return null
  if (classifyKey(key) !== 'user_draft') return null

  try {
    const raw = localStorage.getItem(`draft:${key}`)
    if (!raw) return null
    const entry = JSON.parse(raw) as DraftEntry
    return entry
  } catch {
    return null
  }
}

/**
 * Delete a specific draft.
 */
export function deleteDraft(key: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(`draft:${key}`)
  } catch {
    // Ignore storage errors
  }
}

/**
 * Delete all drafts (called on logout).
 */
export function clearAllDrafts(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i)
      if (storageKey?.startsWith('draft:')) {
        keysToRemove.push(storageKey)
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k)
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * List all saved drafts.
 */
export function listDrafts(): DraftEntry[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const drafts: DraftEntry[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i)
      if (storageKey?.startsWith('draft:')) {
        const raw = localStorage.getItem(storageKey)
        if (raw) {
          try {
            drafts.push(JSON.parse(raw) as DraftEntry)
          } catch {
            // Skip malformed entries
          }
        }
      }
    }
    return drafts.sort((a, b) => b.savedAt - a.savedAt)
  } catch {
    return []
  }
}

/**
 * Check if a draft exists for a given key.
 */
export function hasDraft(key: string): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(`draft:${key}`) !== null
}
