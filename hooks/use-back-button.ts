'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { useOverlayStack } from './use-overlay-stack'

export interface UseBackButtonOptions {
  /** Custom back handler. If provided, overrides default behavior. */
  onBack?: () => void
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
 * Uses an app-local navigation depth counter instead of window.history.length
 * to avoid navigating out of the app when arriving from an external page.
 */
export function useBackButton(options?: UseBackButtonOptions): {
  handleBack: () => void
} {
  const router = useRouter()
  const pathname = usePathname()
  const overlayStack = useOverlayStack()
  const appDepthRef = useRef(0)
  const prevPathnameRef = useRef<string | null>(null)

  // Track app-local navigation depth
  useEffect(() => {
    if (prevPathnameRef.current === null) {
      // First render — initial page, depth 0
      prevPathnameRef.current = pathname
      return
    }

    if (prevPathnameRef.current !== pathname) {
      appDepthRef.current++
      prevPathnameRef.current = pathname
    }
  }, [pathname])

  // Listen for popstate to decrement depth on browser back
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = () => {
      if (appDepthRef.current > 0) {
        appDepthRef.current--
      }
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
    if (appDepthRef.current > 0) {
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
