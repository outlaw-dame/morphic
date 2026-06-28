'use client'

import Link from 'next/link'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { IconLogo } from '@/components/ui/icons'

interface AuthModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <div className="gist-icon-tile mx-auto mb-6 flex size-20 items-center justify-center rounded-full">
            <IconLogo className="size-14" />
          </div>
          <DialogTitle className="font-[var(--font-display)] text-2xl font-semibold">
            Continue with gist.
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            To use gist., sign in to your account or create a new one.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-6 space-y-3">
          <Button asChild className="w-full" size="lg">
            <Link href="/auth/sign-up">Sign up</Link>
          </Button>
          <Button asChild variant="outline" className="w-full" size="lg">
            <Link href="/auth/login">Sign in</Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
