'use client'

import { useCallback, useState } from 'react'
import { usePathname } from 'next/navigation'

import { User } from '@supabase/supabase-js'

import { SidebarTrigger } from '@/components/ui/sidebar'

import { FeedbackModal } from '@/components/feedback-modal'
import GuestMenu from '@/components/guest-menu'
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

  const isAuthPage = pathname.startsWith('/auth')
  const showBack = pathname.startsWith('/search/') && pathname !== '/'
  const isSearchPage = pathname === '/' || pathname.startsWith('/search')

  // Derive page title from route
  const getTitle = () => {
    if (pathname === '/') return 'gist.'
    if (pathname.startsWith('/search')) return 'Search'
    if (pathname.startsWith('/discovery')) return 'Discover'
    if (pathname.startsWith('/library')) return 'Library'
    if (pathname.startsWith('/settings')) return 'gist.'
    if (pathname.startsWith('/reader')) return 'Reader'
    if (isAuthPage) return 'gist.'
    return 'gist.'
  }

  const scrollToTop = useCallback(() => {
    const container = document.querySelector('[data-scroll-container]')
    container?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const trailingActions = isAuthPage
    ? []
    : [
        user ? (
          <UserMenu
            key="user-menu"
            user={user}
            onFeedback={() => setFeedbackOpen(true)}
          />
        ) : (
          <GuestMenu
            key="guest-menu"
            onFeedback={() => setFeedbackOpen(true)}
          />
        )
      ]

  const leadingAction =
    showSidebar && !isAuthPage ? (
      <SidebarTrigger className="gist-icon-button size-10 animate-fade-in" />
    ) : undefined

  return (
    <>
      <div className="flex flex-1 min-w-0">
        {/* Sidebar: ShellPanel-based, renders overlay on mobile, inline on desktop */}
        {showSidebar && <ShellSidebarAdapter />}

        {/* Main shell */}
        <ShellFrame
          className="flex-1 min-w-0 native-app-frame"
          navBar={
            <AppNavBar
              title={getTitle()}
              leadingAction={leadingAction}
              showBack={showBack}
              trailingActions={trailingActions}
              scrollOffset={scrollOffset}
            />
          }
          tabBar={
            isAuthPage ? undefined : (
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
