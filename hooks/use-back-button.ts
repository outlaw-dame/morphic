'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { useOverlayStack } from './use-overlay-stack'

export interface UseBackButtonOptions {
  /** Custom back handler. If provided, overrides default behavior. */
  onBack?: () => void
}

/**
 * Module-scoped navigation depth tracking.
 * Survives component remounts during page transitions.
 */
let globalDepth = 0
let globalPrevPathname: string | null = null
let isBackNavigation = false

/**
 * Reset globals for testing. Call in test beforeEach to prevent pollution.
 */
export function _resetBackButtonGlobals(): void {
  globalDepth = 0
  globalPrevPathname = null
  isBackNavigation = false
}

/**
 * Unifies Android hardware back, browser back, and in-app back button behavior.
 *
 * Priority:
 * 1. If overlays are open → go back in history (triggers overlay close via popstate)
 * 2. If custom `onBack` handler provided → call it
 * 3. If app-local navigation depth > 0 → router.back()
 * 4. Otherwise → navigate to root route '/'
 *
 * Uses module-scoped navigation depth counter (not component-local refs)
 * to survive remounts during page transitions.
 */
export function useBackButton(options?: UseBackButtonOptions): {
  handleBack: () => void
} {
  const router = useRouter()
  const pathname = usePathname()
  const overlayStack = useOverlayStack()

  // Track app-local navigation depth
  useEffect(() => {
    if (globalPrevPathname === null) {
      // First render — initial page, depth 0
      globalPrevPathname = pathname
      return
    }

    if (globalPrevPathname !== pathname) {
      // Only increment for forward navigation, not back navigation
      if (!isBackNavigation) {
        globalDepth++
      }
      isBackNavigation = false
      globalPrevPathname = pathname
    }
  }, [pathname])

  // Listen for popstate to decrement depth on browser/Android back
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = () => {
      if (globalDepth > 0) {
        globalDepth--
      }
      // Mark the next pathname change as a back navigation
      isBackNavigation = true
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const handleBack = () => {
    // If overlays are open, use history.back() so the popstate listener
    // in useOverlayStack can properly close the overlay and clean up
    if (overlayStack.size > 0) {
      window.history.back()
      return
    }

    // Custom handler
    if (options?.onBack) {
      options.onBack()
      return
    }

    // Navigate back within the app, or go to root if at top of app stack
    if (globalDepth > 0) {
      router.back()
    } else {
      router.push('/')
    }
  }

  // Listen for Capacitor/Android back button via the 'backbutton' event
  useEffect(() => {
    if (typeof document === 'undefined') return

    const handleBackButton = (e: Event) => {
      e.preventDefault()
      handleBack()
    }

    document.addEventListener('backbutton', handleBackButton)
    return () => document.removeEventListener('backbutton', handleBackButton)
  })

  return { handleBack }
}
