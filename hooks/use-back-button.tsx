'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { useOverlayStack } from './use-overlay-stack'

export interface UseBackButtonOptions {
  /** Custom back handler. If provided, overrides default behavior. */
  onBack?: () => void
}

// --- Navigation Depth Context ---

interface NavigationDepthState {
  depth: number
}

const NavigationDepthContext = createContext<NavigationDepthState>({ depth: 0 })

/**
 * Provider that tracks app-local navigation depth via React Context.
 *
 * Safe for SSR: state is per-request on server (no global pollution).
 * Survives client-side page transitions without remount issues.
 *
 * Place this inside the root layout providers.
 */
export function NavigationDepthProvider({
  children
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const depthRef = useRef(0)
  const prevPathnameRef = useRef<string | null>(null)
  const isBackRef = useRef(false)
  const [depth, setDepth] = useState(0)

  // Track forward navigations → increment depth
  useEffect(() => {
    if (prevPathnameRef.current === null) {
      prevPathnameRef.current = pathname
      return
    }

    if (prevPathnameRef.current !== pathname) {
      if (!isBackRef.current) {
        depthRef.current++
      } else {
        depthRef.current = Math.max(0, depthRef.current - 1)
      }
      isBackRef.current = false
      prevPathnameRef.current = pathname
      setDepth(depthRef.current)
    }
  }, [pathname])

  // Listen for popstate to mark back navigations
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = () => {
      const currentPath = window.location.pathname
      // Only mark as back if the pathname is actually changing
      if (currentPath !== prevPathnameRef.current) {
        isBackRef.current = true
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  return (
    <NavigationDepthContext.Provider value={{ depth }}>
      {children}
    </NavigationDepthContext.Provider>
  )
}

function useNavigationDepth(): number {
  return useContext(NavigationDepthContext).depth
}

// --- useBackButton hook ---

/**
 * Unifies Android hardware back, browser back, and in-app back button behavior.
 *
 * Priority:
 * 1. If overlays are open → go back in history (triggers overlay close via popstate)
 * 2. If custom `onBack` handler provided → call it
 * 3. If app-local navigation depth > 0 → router.back()
 * 4. Otherwise → navigate to root route '/'
 */
export function useBackButton(options?: UseBackButtonOptions): {
  handleBack: () => void
} {
  const router = useRouter()
  const overlayStack = useOverlayStack()
  const depth = useNavigationDepth()

  const handleBack = () => {
    // If overlays are open, use history.back() so the popstate listener
    // in OverlayStackProvider can properly close the overlay and clean up
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
    if (depth > 0) {
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
  }, [handleBack])

  return { handleBack }
}

/**
 * Reset helper for testing only.
 * @deprecated No longer needed — state is in React Context. Use test providers instead.
 */
export function _resetBackButtonGlobals(): void {
  // No-op — kept for backward compatibility with existing tests
}
