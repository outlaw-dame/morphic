'use client'

import Link from 'next/link'

import {
  Clock,
  Refresh as RefreshCw,
  WarningCircle as AlertCircle
} from 'iconoir-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

interface ErrorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  error: {
    type: 'rate-limit' | 'auth' | 'forbidden' | 'general'
    message: string
    details?: string
  }
  onRetry?: () => void
  onAuthClose?: () => void
}

export function ErrorModal({
  open,
  onOpenChange,
  error,
  onRetry,
  onAuthClose
}: ErrorModalProps) {
  const handleAuthClose = () => {
    onOpenChange(false)
    onAuthClose?.()
  }

  const getErrorIcon = () => {
    switch (error.type) {
      case 'rate-limit':
        return <Clock className="size-6 text-[var(--indigo)]" />
      case 'auth':
      case 'forbidden':
        return <AlertCircle className="size-6 text-destructive" />
      default:
        return <AlertCircle className="size-6 text-[var(--indigo)]" />
    }
  }

  const getErrorTitle = () => {
    switch (error.type) {
      case 'rate-limit':
        return 'Rate limit exceeded'
      case 'auth':
        return 'Continue with gist.'
      case 'forbidden':
        return 'Access denied'
      default:
        return 'Error occurred'
    }
  }

  const getErrorDescription = () => {
    switch (error.type) {
      case 'rate-limit':
        return (
          error.message ||
          'You have made too many requests. Please wait a moment before trying again.'
        )
      case 'auth':
        return (
          error.message ||
          'To use gist., sign in to your account or create a new one.'
        )
      case 'forbidden':
        return 'You do not have permission to access this resource.'
      default:
        return (
          error.message || 'An unexpected error occurred. Please try again.'
        )
    }
  }

  const getErrorDetails = () => {
    if (error.type === 'rate-limit') {
      return error.details || 'The limit resets at midnight UTC.'
    }
    return error.details
  }

  return (
    <Dialog
      open={open}
      onOpenChange={open => {
        if (!open && error.type === 'auth') {
          handleAuthClose()
        } else {
          onOpenChange(open)
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="gist-icon-tile mx-auto mb-4 flex size-14 items-center justify-center rounded-full">
            {getErrorIcon()}
          </div>
          <DialogTitle className="text-center font-[var(--font-display)] text-2xl font-semibold leading-tight">
            {getErrorTitle()}
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            {getErrorDescription()}
          </DialogDescription>
          {getErrorDetails() && (
            <div className="mt-4 rounded-[var(--native-radius-control)] border border-[var(--native-hairline)] bg-muted/50 p-3 text-sm text-muted-foreground">
              {getErrorDetails()}
            </div>
          )}
        </DialogHeader>
        <DialogFooter className="flex-col gap-2">
          {error.type === 'auth' ? (
            <>
              <Button asChild className="w-full">
                <Link href="/auth/sign-up">Sign up</Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/auth/login">Sign in</Link>
              </Button>
            </>
          ) : (
            <>
              {onRetry && error.type !== 'rate-limit' && (
                <Button
                  onClick={() => {
                    onRetry()
                    onOpenChange(false)
                  }}
                  className="w-full"
                >
                  <RefreshCw className="mr-2 size-4" />
                  Try Again
                </Button>
              )}
              <Button
                variant={
                  onRetry && error.type !== 'rate-limit' ? 'outline' : 'default'
                }
                onClick={() => onOpenChange(false)}
                className="w-full"
              >
                {error.type === 'rate-limit' ? 'Understood' : 'Close'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
