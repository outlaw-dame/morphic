'use client'

import { useCallback, useEffect, useId, useRef } from 'react'

import { Drawer as DrawerPrimitive } from 'vaul'

import { cn } from '@/lib/utils'

import { useOverlayStack } from '@/hooks/use-overlay-stack'

export interface ShellSheetProps {
  /** Whether the sheet is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Sheet content */
  children: React.ReactNode
  /** Optional vaul snap points */
  snapPoints?: (string | number)[]
}

/**
 * Bottom sheet surface wrapping vaul's Drawer.
 *
 * - Spring animation from nativeMotion.spring.sheet on open
 * - Drag past 40% to dismiss
 * - Backdrop: rgba(0,0,0,0.8), tap-to-dismiss
 * - Max height 90dvh, internal scroll
 * - Border-radius: --native-radius-sheet top corners
 * - Focus trap within content
 * - History API integration via useOverlayStack
 * - Reduced-motion: opacity-only, no translateY
 */
export function ShellSheet({
  open,
  onOpenChange,
  children,
  snapPoints
}: ShellSheetProps) {
  const overlayStack = useOverlayStack()
  const overlayId = useId()
  const pushedRef = useRef(false)

  // Push overlay entry on open, clean up on close
  useEffect(() => {
    if (open && !pushedRef.current) {
      pushedRef.current = true
      overlayStack.push({
        id: overlayId,
        type: 'sheet',
        close: () => onOpenChange(false)
      })
    } else if (!open && pushedRef.current) {
      pushedRef.current = false
    }
  }, [open, overlayId, onOpenChange, overlayStack])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen)
    },
    [onOpenChange]
  )

  return (
    <DrawerPrimitive.Root
      open={open}
      onOpenChange={handleOpenChange}
      snapPoints={snapPoints}
    >
      <DrawerPrimitive.Portal>
        {/* Backdrop */}
        <DrawerPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/80"
          aria-hidden="true"
        />

        {/* Sheet content */}
        <DrawerPrimitive.Content
          className={cn(
            'shell-sheet fixed inset-x-0 bottom-0 z-50 flex flex-col',
            'border-t bg-background outline-none',
            'motion-safe:transition-transform',
            'motion-reduce:transition-opacity motion-reduce:duration-[1ms]'
          )}
          style={{
            maxHeight: '90dvh',
            borderTopLeftRadius: 'var(--native-radius-sheet)',
            borderTopRightRadius: 'var(--native-radius-sheet)',
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0
          }}
          aria-modal="true"
          role="dialog"
        >
          {/* Drag handle */}
          <div className="mx-auto mt-3 mb-2 h-1.5 w-10 rounded-full bg-muted-foreground/30" />

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4">
            {children}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  )
}

ShellSheet.displayName = 'ShellSheet'
