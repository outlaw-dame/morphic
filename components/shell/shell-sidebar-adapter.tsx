'use client'

import { Suspense } from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

import { IconLogo } from '@/components/ui/icons'
import { useSidebar } from '@/components/ui/sidebar'

import { NativeIcon } from '@/components/native/native-icon'
import { ChatHistorySection } from '@/components/sidebar/chat-history-section'
import { ChatHistorySkeleton } from '@/components/sidebar/chat-history-skeleton'

import { ShellPanel } from './shell-panel'

/**
 * Adapter that renders the sidebar content inside ShellPanel.
 *
 * - Mobile (<768px): ShellPanel overlay from left with backdrop
 * - Desktop (≥768px): ShellPanel persistent inline column
 * - Connects to existing SidebarProvider open/close state
 * - Back button on mobile dismisses via useOverlayStack integration
 */
export function ShellSidebarAdapter() {
  const { open, setOpen, openMobile, setOpenMobile, isMobile } = useSidebar()

  // Use mobile state on mobile, desktop state on desktop
  const isOpen = isMobile ? openMobile : open
  const setIsOpen = isMobile
    ? (value: boolean) => setOpenMobile(value)
    : (value: boolean) => setOpen(value)

  const handleClose = () => setIsOpen(false)

  return (
    <ShellPanel open={isOpen} onOpenChange={setIsOpen} side="left">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b">
          <Link href="/" className="flex items-center gap-2 px-1">
            <IconLogo className="size-5" />
            <span className="font-semibold text-sm">Morphic</span>
          </Link>
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-foreground"
            style={{
              minWidth: 'var(--native-min-touch-target)',
              minHeight: 'var(--native-min-touch-target)'
            }}
            aria-label="Close sidebar"
          >
            <NativeIcon name="close" size={18} />
          </button>
        </div>

        {/* Navigation items */}
        <nav className="flex flex-col gap-1 p-3">
          <SidebarLink
            href="/"
            icon="newChat"
            label="New Chat"
            onClick={handleClose}
          />
          <SidebarLink
            href="/discovery"
            icon="discover"
            label="Discovery"
            onClick={handleClose}
          />
          <SidebarLink
            href="/library"
            icon="library"
            label="Library"
            onClick={handleClose}
          />
        </nav>

        {/* Chat history */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <Suspense fallback={<ChatHistorySkeleton />}>
            <ChatHistorySection />
          </Suspense>
        </div>
      </div>
    </ShellPanel>
  )
}

function SidebarLink({
  href,
  icon,
  label,
  onClick
}: {
  href: string
  icon: 'newChat' | 'discover' | 'library'
  label: string
  onClick?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground',
        'hover:bg-accent hover:text-foreground transition-colors'
      )}
      style={{ minHeight: 'var(--native-min-touch-target)' }}
    >
      <NativeIcon name={icon} size={18} />
      <span>{label}</span>
    </Link>
  )
}

ShellSidebarAdapter.displayName = 'ShellSidebarAdapter'
