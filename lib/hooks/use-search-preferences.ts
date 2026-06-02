'use client'

import { useSyncExternalStore } from 'react'

import {
  DEFAULT_SEARCH_PREFERENCES,
  getSearchPreferences,
  SearchPreferences,
  setSearchPreferences
} from '@/lib/config/search-preferences'
import { getCookie, subscribeToCookieChange } from '@/lib/utils/cookies'

const SEARCH_PREFERENCES_COOKIE = 'searchPreferences'

let cachedCookieValue: string | null | undefined
let cachedSnapshot: SearchPreferences = DEFAULT_SEARCH_PREFERENCES

function getSnapshot(): SearchPreferences {
  const cookieValue = getCookie(SEARCH_PREFERENCES_COOKIE)

  if (cookieValue === cachedCookieValue) {
    return cachedSnapshot
  }

  cachedCookieValue = cookieValue
  cachedSnapshot = getSearchPreferences()
  return cachedSnapshot
}

function getServerSnapshot(): SearchPreferences {
  return DEFAULT_SEARCH_PREFERENCES
}

export function useSearchPreferences() {
  const preferences = useSyncExternalStore(
    subscribeToCookieChange,
    getSnapshot,
    getServerSnapshot
  )

  return {
    preferences,
    setPreferences: (partial: Partial<SearchPreferences>) =>
      setSearchPreferences(partial)
  }
}
