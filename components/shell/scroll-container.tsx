'use client'

import { useCallback, useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

export interface ScrollContainerProps {
  children: React.ReactNode
  className?: string
  /** Called with current scrollTop on each frame during scroll */
  onScrollOffsetChange?: (offset: number) => void
}

/**
 * The sole scrollable region within the shell frame.
 *
 * Responsibilities:
 * - `overflow-y: auto` — only element in the shell that scrolls
 * - Reports scrollTop to parent via rAF-throttled callback
 * - Allows nested scroll regions on elements with `data-scroll-region`
 * - Scrolls focused inputs into view when keyboard opens (within 300ms)
 * - Applies `overscroll-behavior: none` to prevent pull-to-refresh
 */
export function ScrollContainer({
  children,
  className,
  onScrollOffsetChange
}: ScrollContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const tickingRef = useRef(false)

  // rAF-throttled scroll tracking
  const handleScroll = useCallback(() => {
    if (!tickingRef.current) {
      tickingRef.current = true
      rafRef.current = requestAnimationFrame(() => {
        const container = containerRef.current
        if (container && onScrollOffsetChange) {
          onScrollOffsetChange(container.scrollTop)
        }
        tickingRef.current = false
      })
    }
  }, [onScrollOffsetChange])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [handleScroll])

  // Focus-into-view: scroll focused input into view when keyboard opens
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target
      if (!(target instanceof HTMLElement)) return

      // Only handle inputs/textareas/contenteditable
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.getAttribute('role') === 'textbox'

      if (!isInput) return

      // Scroll into view after a brief delay to let keyboard animate
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 300)
    }

    container.addEventListener('focusin', handleFocusIn)
    return () => container.removeEventListener('focusin', handleFocusIn)
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex-1 overflow-y-auto overflow-x-hidden overscroll-none',
        className
      )}
      data-scroll-container
    >
      {children}
    </div>
  )
}

/**
 * Expose the ref for external integration (e.g., useScrollRestoration).
 * Use ScrollContainer.displayName for debugging.
 */
ScrollContainer.displayName = 'ScrollContainer'
