'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import type { User } from '@supabase/supabase-js'
import {
  IconDeviceLaptop as Laptop,
  IconMoon as Moon,
  IconSun as Sun,
  IconTrash as Trash2
} from '@tabler/icons-react'
import { toast } from 'sonner'

import { deleteAccount } from '@/lib/actions/account'
import { createClient } from '@/lib/supabase/client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'

import { useTheme } from '@/components/theme-provider'

interface AccountSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User
}

const themeOptions = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop }
]

export function AccountSettingsDialog({
  open,
  onOpenChange,
  user
}: AccountSettingsDialogProps) {
  const router = useRouter()
  const { setTheme, theme } = useTheme()
  const [isDeleting, startDeleteTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const activeTheme = theme ?? 'system'

  const userName =
    user.user_metadata?.full_name || user.user_metadata?.name || 'User'

  const handleDeleteAccount = () => {
    startDeleteTransition(async () => {
      const result = await deleteAccount()

      if (result.success) {
        try {
          await createClient().auth.signOut()
        } catch (error) {
          console.error('Failed to clear client session:', error)
        }

        toast.success('Account deleted')
        setConfirmOpen(false)
        onOpenChange(false)
        router.push('/')
        router.refresh()
        return
      }

      toast.error(result.error ?? 'Failed to delete account')
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        if (!isDeleting) {
          if (!nextOpen) {
            setConfirmOpen(false)
          }
          onOpenChange(nextOpen)
        }
      }}
    >
      <DialogContent className="sm:max-w-md rounded-[var(--native-radius-sheet)] border-border/60 bg-background/95 shadow-2xl backdrop-blur-xl">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl tracking-tight">Account</DialogTitle>
          <DialogDescription>
            Manage your account preferences and data.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <section className="rounded-2xl border border-border/50 bg-muted/25 p-4">
            <div className="grid gap-1">
              <h3 className="text-sm font-semibold">Profile</h3>
              <div className="text-sm text-muted-foreground">
                <p className="truncate font-medium text-foreground">{userName}</p>
                <p className="truncate">{user.email}</p>
              </div>
            </div>
          </section>

          <Separator />

          <section className="grid gap-3">
            <div className="grid gap-1">
              <h3 className="text-sm font-semibold">Theme</h3>
              <p className="text-sm text-muted-foreground">
                Choose how Morphic appears on this device.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border/50 bg-muted/25 p-1.5">
              {themeOptions.map(option => {
                const Icon = option.icon
                const selected = activeTheme === option.value

                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant={selected ? 'secondary' : 'ghost'}
                    className="h-16 flex-col gap-1.5 rounded-xl px-2"
                    aria-pressed={selected}
                    onClick={() => setTheme(option.value)}
                  >
                    <Icon className="size-4" />
                    <span className="text-xs">{option.label}</span>
                  </Button>
                )
              })}
            </div>
          </section>

          <Separator />

          <section className="grid gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 p-4">
            <div className="grid gap-1">
              <h3 className="text-sm font-semibold text-destructive">
                Delete account
              </h3>
              <p className="text-sm text-muted-foreground">
                Permanently delete your account, chat history, and uploaded
                files. This action cannot be undone.
              </p>
            </div>

            <AlertDialog
              open={confirmOpen}
              onOpenChange={nextOpen => {
                if (!isDeleting) {
                  setConfirmOpen(nextOpen)
                }
              }}
            >
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  className="w-fit gap-2 rounded-full"
                  disabled={isDeleting}
                >
                  <Trash2 className="size-4" />
                  Delete account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-[var(--native-radius-sheet)] border-border/60 bg-background/95 shadow-2xl backdrop-blur-xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. Your account, chat history,
                    and uploaded files will be permanently deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-full" disabled={isDeleting}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={isDeleting}
                    onClick={event => {
                      event.preventDefault()
                      handleDeleteAccount()
                    }}
                    className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting ? <Spinner /> : 'Delete account'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
