'use client'

import { cn } from '@/lib/utils'

import { useKeyboardState } from '@/hooks/use-keyboard-state'

export interface ShellFrameProps {
  children: React.ReactNode
  /** Navigation bar slot (top zone) */
  navBar?: React.ReactNode
  /** Tab bar slot (bottom zone, mobile only) */
  tabBar?: React.ReactNode
  className?: string
}

/**
 * Root layout wrapper that establishes the fixed viewport frame.
 *
 * Structure:
 *   ┌─────────────────────────┐
 *   │ navBar (auto height)    │
 *   ├─────────────────────────┤
 *   │ children (flex-grow)    │  ← ScrollContainer goes here
 *   ├─────────────────────────┤
 *   │ tabBar (auto, mobile)   │
 *   └─────────────────────────┘
 *
 * Responsibilities:
 * - Fixed viewport: 100dvh, overflow hidden
 * - Safe-area padding: top (status bar), landscape left/right
 * - Overscroll suppression on root
 * - Keyboard response: hides tabBar when keyboard is open
 */
export function ShellFrame({
  children,
  navBar,
  tabBar,
  className
}: ShellFrameProps) {
  const { isOpen: isKeyboardOpen } = useKeyboardState()

  return (
    <div
      className={cn('shell-frame flex flex-col overflow-hidden', className)}
      style={{
        height: '100dvh',
        paddingTop: 'var(--native-safe-top)'
      }}
    >
      {/* Top zone: navigation bar */}
      {navBar && <div className="shrink-0 overflow-hidden">{navBar}</div>}

      {/* Middle zone: scrollable content (flex-grow) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">{children}</div>

      {/* Bottom zone: tab bar (hidden on desktop, hidden when keyboard open) */}
      {tabBar && (
        <div
          className={cn(
            'shrink-0 overflow-hidden transition-transform duration-200 md:hidden',
            isKeyboardOpen && 'translate-y-full'
          )}
          style={{
            paddingBottom: 'var(--native-safe-bottom)'
          }}
        >
          {tabBar}
        </div>
      )}
    </div>
  )
}

ShellFrame.displayName = 'ShellFrame'
