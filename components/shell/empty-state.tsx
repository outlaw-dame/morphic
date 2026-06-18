'use client'

import type { NativeIconName } from '@/lib/native/icon-map'
import { cn } from '@/lib/utils'

import { NativeIcon } from '@/components/native/native-icon'

export interface EmptyStateProps {
  /** Icon name from the icon-map registry */
  icon: NativeIconName
  /** Title text (max 60 characters recommended) */
  title: string
  /** Description text (max 200 characters recommended) */
  description: string
  /** Optional action button */
  action?: { label: string; onClick: () => void }
  className?: string
}

/**
 * Informative zero-content view with optional call-to-action.
 *
 * - Centered vertically and horizontally in parent ScrollContainer
 * - NativeIcon at 48px
 * - Optional action button with min touch target
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-12 flex-1',
        className
      )}
    >
      <NativeIcon
        name={icon}
        size={48}
        className="text-muted-foreground mb-4"
      />
      <h2 className="font-semibold text-base text-foreground mb-1">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          style={{
            minWidth: 'var(--native-min-touch-target)',
            minHeight: 'var(--native-min-touch-target)'
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

EmptyState.displayName = 'EmptyState'
