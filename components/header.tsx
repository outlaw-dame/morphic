'use client'

import React, { useState } from 'react'
import { usePathname } from 'next/navigation'

import { User } from '@supabase/supabase-js'

import { cn } from '@/lib/utils'

import { useSidebar } from '@/components/ui/sidebar'

import { Button } from './ui/button'
import { FeedbackModal } from './feedback-modal'
import GuestMenu from './guest-menu'
import UserMenu from './user-menu'

interface HeaderProps {
  user: User | null
}

export const Header: React.FC<HeaderProps> = ({ user }) => {
  const { open } = useSidebar()
  const pathname = usePathname()
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const isRootPage = pathname === '/'

  return (
    <>
      <header
        className={cn(
          'absolute top-0 right-0 z-10 flex min-h-[var(--native-toolbar-height)] w-full items-center justify-between border-b border-border/30 bg-background/70 px-3 py-2 shadow-sm backdrop-blur-xl transition-[width,background-color,border-color,box-shadow] duration-200 ease-[var(--motion-ease-out)]',
          open ? 'md:w-[calc(100%-var(--sidebar-width))]' : 'md:w-full'
        )}
      >
        <div className="pointer-events-none text-sm font-semibold tracking-tight text-muted-foreground/80">
          {isRootPage ? '' : 'Morphic'}
        </div>

        <div className="flex items-center gap-2">
          {isRootPage && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-full border-border/60 bg-background/70 px-3 shadow-none backdrop-blur-md"
              onClick={() => setFeedbackOpen(true)}
            >
              Feedback
            </Button>
          )}
          {user ? <UserMenu user={user} /> : <GuestMenu />}
        </div>
      </header>

      {isRootPage && (
        <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      )}
    </>
  )
}

export default Header
