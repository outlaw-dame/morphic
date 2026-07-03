'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { User } from '@supabase/supabase-js'

import { FeedbackModal } from '@/components/feedback-modal'
import { NativeIcon } from '@/components/native/native-icon'
import UserMenu from '@/components/user-menu'

import { AppNavBar } from './app-nav-bar'
import { ScrollContainer } from './scroll-container'
import { ShellFrame } from './shell-frame'
import { ShellSidebarAdapter } from './shell-sidebar-adapter'
import { TabBar, type TabItem } from './tab-bar'

const TAB_ITEMS: TabItem[] = [
  { icon: 'home', label: 'Home', href: '/' },
  { icon: 'search', label: 'Search', href: '/search' },
  { icon: 'discover', label: 'Discover', href: '/discovery' },
  { icon: 'library', label: 'Library', href: '/library' },
  { icon: 'settings', label: 'Settings', href: '/settings' }
]

interface ShellLayoutProps {
  children: React.ReactNode
  user: User | null
  /** Whether to show the sidebar (user is authenticated) */
  showSidebar?: boolean
}

/**
 * Client-side shell layout that composes ShellFrame, AppNavBar, TabBar,
 * and ScrollContainer. This replaces the previous Header + native-app-frame
 * structure with the full mobile shell infrastructure.
 */
export function ShellLayout({
  children,
  user,
  showSidebar = false
}: ShellLayoutProps) {
  const pathname = usePathname()
  const [scrollOffset, setScrollOffset] = useState(0)
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const showBack = pathname.startsWith('/search/') && pathname !== '/'
  const isSearchPage = pathname === '/' || pathname.startsWith('/search')
  const isImmersiveRoute = pathname === '/discovery'

  const scrollToTop = useCallback(() => {
    const container = document.querySelector('[data-scroll-container]')
    container?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const settingsAction = (
    <Link
      href="/settings"
      aria-label="Open settings"
      className="inline-flex size-11 items-center justify-center rounded-full bg-zinc-900/80 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] transition-transform duration-[140ms] hover:scale-[1.02] dark:bg-zinc-900"
    >
      <NativeIcon name="settings" className="size-5" />
    </Link>
  )

  const trailingActions = user
    ? [
        <UserMenu
          key="user-menu"
          user={user}
          onFeedback={() => setFeedbackOpen(true)}
        />
      ]
    : [
        <Link
          key="guest-login"
          href="/auth/login"
          aria-label="Sign in"
          className="inline-flex size-11 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-fuchsia-500 text-sm font-bold text-white shadow-[0_12px_34px_rgba(99,102,241,0.32)]"
        >
          s
        </Link>
      ]

  return (
    <>
      <div className="flex flex-1 min-w-0">
        {/* Sidebar: ShellPanel-based, renders overlay on mobile, inline on desktop */}
        {showSidebar && <ShellSidebarAdapter />}

        {/* Main shell */}
        <ShellFrame
          className="flex-1 min-w-0 native-app-frame"
          navBar={
            isImmersiveRoute ? undefined : (
              <AppNavBar
                title="gist."
                leadingAction={settingsAction}
                showBack={showBack}
                trailingActions={trailingActions}
                scrollOffset={scrollOffset}
              />
            )
          }
          tabBar={
            isImmersiveRoute ? undefined : (
              <TabBar items={TAB_ITEMS} onScrollToTop={scrollToTop} />
            )
          }
        >
          <ScrollContainer
            className="native-app-main"
            onScrollOffsetChange={setScrollOffset}
          >
            {children}
          </ScrollContainer>
        </ShellFrame>
      </div>

      {isSearchPage && (
        <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      )}
    </>
  )
}

ShellLayout.displayName = 'ShellLayout'
