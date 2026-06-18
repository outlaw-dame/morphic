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
  // Normalize key: strip draft: prefix if already present
  const cleanKey = key.startsWith('draft:') ? key.slice(6) : key
  if (classifyKey(cleanKey) !== 'user_draft') return false
  if (typeof content !== 'string' || !content.trim()) {
    // Empty or invalid content → delete the draft
    deleteDraft(cleanKey)
    return true
  }

  try {
    const entry: DraftEntry = {
      key: cleanKey,
      content,
      savedAt: Date.now()
    }
    localStorage.setItem(`draft:${cleanKey}`, JSON.stringify(entry))
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
  const cleanKey = key.startsWith('draft:') ? key.slice(6) : key
  if (classifyKey(cleanKey) !== 'user_draft') return null

  try {
    const raw = localStorage.getItem(`draft:${cleanKey}`)
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
  const cleanKey = key.startsWith('draft:') ? key.slice(6) : key
  try {
    localStorage.removeItem(`draft:${cleanKey}`)
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
            const parsed = JSON.parse(raw)
            if (parsed && typeof parsed.content === 'string') {
              drafts.push({
                key: (parsed.key || storageKey).replace(/^draft:/, ''),
                content: parsed.content,
                savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0
              })
            }
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
  const cleanKey = key.startsWith('draft:') ? key.slice(6) : key
  return localStorage.getItem(`draft:${cleanKey}`) !== null
}
