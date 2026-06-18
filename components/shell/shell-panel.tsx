'use client'

import { useCallback, useEffect, useId, useRef } from 'react'

import { cn } from '@/lib/utils'

import { useOverlayStack } from '@/hooks/use-overlay-stack'

export interface ShellPanelProps {
  /** Whether the panel is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Which side the panel slides from */
  side?: 'left' | 'right'
  /** Panel content */
  children: React.ReactNode
}

/**
 * Side panel for history/navigation, adaptive between overlay and inline.
 *
 * - Mobile (<768px): overlay from left/right, max 85vw, backdrop, slide-in
 * - Desktop (≥768px): persistent inline column 240–320px, no overlay
 * - Safe-area padding on left edge
 * - History API integration on mobile via useOverlayStack
 * - Focus return on dismiss
 * - Reduced-motion: opacity-only, no translateX
 */
export function ShellPanel({
  open,
  onOpenChange,
  side = 'left',
  children
}: ShellPanelProps) {
  const overlayStack = useOverlayStack()
  const overlayId = useId()
  const pushedRef = useRef(false)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Track previously focused element for focus return
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null
    }
  }, [open])

  // Push overlay entry on open (mobile only — desktop is always inline)
  useEffect(() => {
    if (open && !pushedRef.current) {
      // Only push history for mobile overlay mode
      // We check viewport width; on desktop this is a no-op
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        pushedRef.current = true
        overlayStack.push({
          id: overlayId,
          type: 'panel',
          close: () => onOpenChange(false)
        })
      }
    } else if (!open && pushedRef.current) {
      pushedRef.current = false
      // Return focus
      previousFocusRef.current?.focus()
    }
  }, [open, overlayId, onOpenChange, overlayStack])

  const handleBackdropClick = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  return (
    <>
      {/* Mobile overlay backdrop */}
      {open && (
        <div
          className="shell-panel-backdrop fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={handleBackdropClick}
          aria-hidden="true"
        />
      )}

      {/* Panel content */}
      <aside
        className={cn(
          'shell-panel z-50 bg-background border-r flex flex-col',
          // Mobile: fixed overlay
          'fixed top-0 bottom-0 max-w-[85vw]',
          'motion-safe:transition-transform motion-safe:duration-300',
          'motion-reduce:transition-opacity motion-reduce:duration-[1ms]',
          // Desktop: static inline column
          'md:static md:max-w-none md:translate-x-0 md:transition-none',
          // Side positioning
          side === 'left' && 'left-0',
          side === 'right' && 'right-0 border-r-0 border-l',
          // Open/close transform (mobile only)
          !open && side === 'left' && '-translate-x-full',
          !open && side === 'right' && 'translate-x-full',
          open && 'translate-x-0'
        )}
        style={{
          width: 'clamp(240px, 75vw, 320px)',
          paddingLeft: side === 'left' ? 'var(--native-safe-left)' : undefined,
          paddingRight:
            side === 'right' ? 'var(--native-safe-right)' : undefined
        }}
        aria-hidden={!open}
        role="complementary"
        aria-label="Side panel"
      >
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </aside>
    </>
  )
}

ShellPanel.displayName = 'ShellPanel'
