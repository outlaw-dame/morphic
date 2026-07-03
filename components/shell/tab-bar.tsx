'use client'

import { useCallback } from 'react'
import { usePathname } from 'next/navigation'

import { hapticLight } from '@/lib/native/haptics'
import type { NativeIconName } from '@/lib/native/icon-map'
import { isNative } from '@/lib/native/runtime'
import { cn } from '@/lib/utils'

import { NativeIcon } from '@/components/native/native-icon'

export interface TabItem {
  /** Icon name from the icon-map registry */
  icon: NativeIconName
  /** Text label below the icon */
  label: string
  /** Route to navigate to on tap */
  href: string
}

export interface TabBarProps {
  /** Tab items to render (3–5 recommended) */
  items: TabItem[]
  /** Callback fired when user taps the already-active tab */
  onScrollToTop?: () => void
  /** Whether the tab bar is hidden (e.g., keyboard is open) */
  hidden?: boolean
}

/**
 * Persistent bottom tab bar for primary navigation on mobile.
 *
 * - Renders only below 768px (hidden via md:hidden on parent in ShellFrame)
 * - Each item: NativeIcon + label, min touch target
 * - Active tab: distinct foreground color
 * - Re-tap active tab: scroll to top instead of navigating
 * - Haptic feedback on native runtimes
 */
export function TabBar({ items, onScrollToTop, hidden = false }: TabBarProps) {
  const pathname = usePathname()

  const handleTabPress = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      // Fire haptic on native runtimes
      if (isNative()) {
        hapticLight()
      }

      const currentPath =
        typeof window === 'undefined' ? pathname : window.location.pathname

      if (currentPath === href || currentPath.startsWith(href + '/')) {
        event.preventDefault()
        onScrollToTop?.()
      }
    },
    [pathname, onScrollToTop]
  )

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <nav
      className={cn(
        'shell-tab-bar flex items-center justify-around border-t border-white/10 bg-black/95 text-white backdrop-blur-sm',
        'transition-transform duration-200',
        hidden && 'translate-y-full'
      )}
      style={{
        height: 'var(--native-bottom-bar-height, 72px)'
      }}
      role="tablist"
      aria-label="Main navigation"
    >
      {items.map(item => {
        const active = isActive(item.href)
        return (
          <a
            key={item.href}
            href={item.href}
            role="tab"
            aria-selected={active}
            aria-label={item.label}
            onClick={event => handleTabPress(event, item.href)}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1',
              'transition-colors duration-150'
            )}
            style={{
              minWidth: 'var(--native-min-touch-target)',
              minHeight: 'var(--native-min-touch-target)'
            }}
          >
            <NativeIcon
              name={item.icon}
              size={22}
              className={cn(active ? 'text-white' : 'text-white/48')}
            />
            <span
              className={cn(
                'text-[10px] font-medium leading-tight',
                active ? 'text-white' : 'text-white/48'
              )}
            >
              {item.label}
            </span>
          </a>
        )
      })}
    </nav>
  )
}

TabBar.displayName = 'TabBar'
