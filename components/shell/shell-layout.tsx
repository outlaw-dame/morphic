'use client'

import { useCallback, useState } from 'react'
import { usePathname } from 'next/navigation'

import { User } from '@supabase/supabase-js'

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

  const showBack = pathname.startsWith('/search/') && pathname !== '/'
  const isSearchPage = pathname === '/' || pathname.startsWith('/search')

  // Derive page title from route
  const getTitle = () => {
    if (pathname === '/') return 'Morphic'
    if (pathname.startsWith('/search')) return 'Search'
    if (pathname.startsWith('/discovery')) return 'Discover'
    if (pathname.startsWith('/library')) return 'Library'
    if (pathname.startsWith('/settings')) return 'Settings'
    if (pathname.startsWith('/reader')) return 'Reader'
    return 'Morphic'
  }

  const scrollToTop = useCallback(() => {
    const container = document.querySelector('[data-scroll-container]')
    container?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const trailingActions = [
    user ? (
      <UserMenu
        key="user-menu"
        user={user}
        onFeedback={() => setFeedbackOpen(true)}
      />
    ) : (
      <GuestMenu key="guest-menu" onFeedback={() => setFeedbackOpen(true)} />
    )
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
            <AppNavBar
              title={getTitle()}
              showBack={showBack}
              trailingActions={trailingActions}
              scrollOffset={scrollOffset}
            />
          }
          tabBar={<TabBar items={TAB_ITEMS} onScrollToTop={scrollToTop} />}
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
