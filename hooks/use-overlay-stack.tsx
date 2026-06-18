'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef
} from 'react'

export interface OverlayEntry {
  /** Unique identifier for this overlay instance */
  id: string
  /** Type of overlay surface */
  type: 'sheet' | 'panel' | 'dialog'
  /** Function to close this overlay */
  close: () => void
}

export interface OverlayStackAPI {
  /** Push an overlay onto the stack and add a history entry */
  push: (entry: OverlayEntry) => void
  /** Pop the topmost overlay (called by back button handler) */
  pop: () => void
  /** Peek at the topmost entry without removing it */
  peek: () => OverlayEntry | null
  /** Current number of overlays in the stack */
  size: number
}

const OVERLAY_STATE_KEY = '__morphic_overlay__'

const OverlayStackContext = createContext<OverlayStackAPI | null>(null)

/**
 * Provider that manages a shared, centralized LIFO overlay stack.
 *
 * Must be placed once at the root of the application (inside layout providers).
 * All overlay components (ShellSheet, ShellPanel, dialogs) share this single stack
 * and a single popstate listener handles back-button behavior in LIFO order.
 */
export function OverlayStackProvider({
  children
}: {
  children: React.ReactNode
}) {
  const stackRef = useRef<OverlayEntry[]>([])

  const push = useCallback((entry: OverlayEntry) => {
    stackRef.current = [...stackRef.current, entry]
    if (typeof window !== 'undefined') {
      window.history.pushState({ [OVERLAY_STATE_KEY]: entry.id }, '')
    }
  }, [])

  const pop = useCallback(() => {
    const stack = stackRef.current
    if (stack.length === 0) return
    const topmost = stack[stack.length - 1]
    stackRef.current = stack.slice(0, -1)
    topmost.close()
  }, [])

  const peek = useCallback((): OverlayEntry | null => {
    const stack = stackRef.current
    return stack.length > 0 ? stack[stack.length - 1] : null
  }, [])

  // Single popstate listener for the entire app
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = (event: PopStateEvent) => {
      if (stackRef.current.length === 0) return

      const state = event.state
      // Our overlay marker is present, or we have overlays and any back was triggered
      if (
        (state && typeof state === 'object' && OVERLAY_STATE_KEY in state) ||
        stackRef.current.length > 0
      ) {
        const topmost = stackRef.current[stackRef.current.length - 1]
        stackRef.current = stackRef.current.slice(0, -1)
        topmost.close()
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const api: OverlayStackAPI = {
    push,
    pop,
    peek,
    get size() {
      return stackRef.current.length
    }
  }

  return (
    <OverlayStackContext.Provider value={api}>
      {children}
    </OverlayStackContext.Provider>
  )
}

/**
 * Access the shared overlay stack.
 *
 * Falls back to a no-op API if used outside the provider (e.g., during SSR or in tests
 * that don't wrap with the provider). This ensures shell components don't crash.
 */
export function useOverlayStack(): OverlayStackAPI {
  const ctx = useContext(OverlayStackContext)
  if (ctx) return ctx

  // Fallback for SSR or missing provider — no-op behavior
  return {
    push: () => {},
    pop: () => {},
    peek: () => null,
    size: 0
  }
}

/**
 * Close an overlay and go back in history (removes the overlay's history entry).
 * Use this when programmatically closing an overlay (not via back button).
 */
export function closeOverlayWithHistory(): void {
  if (typeof window !== 'undefined') {
    window.history.back()
  }
}
