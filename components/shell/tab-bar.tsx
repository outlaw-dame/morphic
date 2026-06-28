'use client'

import { useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'

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
  const router = useRouter()
  const pathname = usePathname()

  const handleTabPress = useCallback(
    (href: string) => {
      // Fire haptic on native runtimes
      if (isNative()) {
        hapticLight()
      }

      // If already on this tab, scroll to top
      if (pathname === href || pathname.startsWith(href + '/')) {
        onScrollToTop?.()
        return
      }

      router.push(href)
    },
    [pathname, router, onScrollToTop]
  )

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <nav
      className={cn(
        'shell-tab-bar flex items-center justify-around',
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
          <button
            key={item.href}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={item.label}
            onClick={() => handleTabPress(item.href)}
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
              className={cn(
                'rounded-full p-0.5 transition-colors duration-150',
                active ? 'gist-tab-icon-active' : 'text-muted-foreground'
              )}
            />
            <span
              className={cn(
                'text-[10px] font-medium leading-tight',
                active ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {item.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

TabBar.displayName = 'TabBar'
