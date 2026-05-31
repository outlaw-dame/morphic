import { Suspense } from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarRail,
  SidebarTrigger
} from '@/components/ui/sidebar'

import { ChatHistorySection } from './sidebar/chat-history-section'
import { ChatHistorySkeleton } from './sidebar/chat-history-skeleton'
import { NewChatMenuItem } from './sidebar/new-chat-menu-item'
import { IconLogo } from './ui/icons'

export default function AppSidebar() {
  return (
    <Sidebar side="left" variant="sidebar" collapsible="offcanvas">
      <SidebarHeader className="flex flex-row items-center justify-between border-b border-border/40 bg-background/70 px-2 py-2 backdrop-blur-xl">
        <Link
          href="/"
          className="flex min-h-10 items-center gap-2 rounded-full px-2.5 py-2 transition-colors hover:bg-muted/70"
        >
          <IconLogo className={cn('size-5')} />
          <span className="text-sm font-semibold tracking-tight">Morphic</span>
        </Link>
        <SidebarTrigger className="rounded-full" />
      </SidebarHeader>
      <SidebarContent className="flex h-full flex-col bg-background/70 px-2 py-4 backdrop-blur-xl">
        <SidebarMenu className="rounded-2xl border border-border/50 bg-background/55 p-1 shadow-sm">
          <NewChatMenuItem />
        </SidebarMenu>
        <div className="mt-3 flex-1 overflow-y-auto rounded-2xl border border-border/40 bg-background/45 p-1 shadow-sm">
          <Suspense fallback={<ChatHistorySkeleton />}> 
            <ChatHistorySection />
          </Suspense>
        </div>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
