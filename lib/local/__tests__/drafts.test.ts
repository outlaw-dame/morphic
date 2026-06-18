import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearAllDrafts,
  deleteDraft,
  hasDraft,
  listDrafts,
  loadDraft,
  saveDraft
} from '../drafts'

describe('drafts', () => {
  let storage: Record<string, string>

  beforeEach(() => {
    storage = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => {
        storage[key] = value
      },
      removeItem: (key: string) => {
        delete storage[key]
      },
      key: (i: number) => Object.keys(storage)[i] ?? null,
      get length() {
        return Object.keys(storage).length
      },
      clear: () => {
        storage = {}
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves and loads a draft', () => {
    saveDraft('search-draft', 'hello world')
    const loaded = loadDraft('search-draft')
    expect(loaded).not.toBeNull()
    expect(loaded!.content).toBe('hello world')
    expect(loaded!.key).toBe('search-draft')
  })

  it('returns null for non-existent draft', () => {
    expect(loadDraft('search-draft')).toBeNull()
  })

  it('rejects saving to non-draft classified keys', () => {
    const result = saveDraft('auth-token', 'secret')
    expect(result).toBe(false)
    expect(storage['draft:auth-token']).toBeUndefined()
  })

  it('deletes a draft when saving empty content', () => {
    saveDraft('search-draft', 'something')
    expect(hasDraft('search-draft')).toBe(true)

    saveDraft('search-draft', '')
    expect(hasDraft('search-draft')).toBe(false)
  })

  it('deleteDraft removes the entry', () => {
    saveDraft('search-draft', 'test')
    deleteDraft('search-draft')
    expect(loadDraft('search-draft')).toBeNull()
  })

  it('clearAllDrafts removes all draft entries', () => {
    saveDraft('search-draft', 'query 1')
    saveDraft('feedback-draft', 'feedback text')
    storage['non-draft-key'] = 'should stay'

    clearAllDrafts()

    expect(loadDraft('search-draft')).toBeNull()
    expect(loadDraft('feedback-draft')).toBeNull()
    expect(storage['non-draft-key']).toBe('should stay')
  })

  it('listDrafts returns all saved drafts sorted by most recent', () => {
    saveDraft('search-draft', 'first')
    // Simulate second draft saved later
    const entry = JSON.parse(storage['draft:search-draft'])
    entry.savedAt = Date.now() - 10000
    storage['draft:search-draft'] = JSON.stringify(entry)

    saveDraft('feedback-draft', 'second')

    const drafts = listDrafts()
    expect(drafts).toHaveLength(2)
    expect(drafts[0].key).toBe('feedback-draft') // more recent
  })

  it('hasDraft returns true when draft exists', () => {
    saveDraft('search-draft', 'content')
    expect(hasDraft('search-draft')).toBe(true)
  })

  it('hasDraft returns false when no draft exists', () => {
    expect(hasDraft('search-draft')).toBe(false)
  })
})
