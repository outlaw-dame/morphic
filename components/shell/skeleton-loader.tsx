'use client'

import { cn } from '@/lib/utils'

export interface SkeletonLoaderProps {
  /** Layout preset for placeholder arrangement */
  variant?: 'list' | 'card' | 'content'
  /** Number of placeholder blocks to render */
  blocks?: number
  className?: string
}

/**
 * Consistent loading placeholder rendered during page transitions.
 *
 * - CSS @keyframes shimmer animation (no JS-driven animation)
 * - Static blocks when prefers-reduced-motion is active
 * - Swap to real content without intermediate blank frames
 */
export function SkeletonLoader({
  variant = 'content',
  blocks = 3,
  className
}: SkeletonLoaderProps) {
  return (
    <div
      className={cn('flex flex-col gap-3 p-4', className)}
      role="status"
      aria-label="Loading"
      aria-busy="true"
    >
      {Array.from({ length: blocks }, (_, i) => (
        <SkeletonBlock key={i} variant={variant} index={i} />
      ))}
    </div>
  )
}

function SkeletonBlock({
  variant,
  index
}: {
  variant: 'list' | 'card' | 'content'
  index: number
}) {
  if (variant === 'list') {
    return (
      <div className="flex items-center gap-3">
        <div className="skeleton-shimmer h-10 w-10 rounded-full shrink-0" />
        <div className="flex-1 flex flex-col gap-2">
          <div className="skeleton-shimmer h-4 rounded w-3/4" />
          <div className="skeleton-shimmer h-3 rounded w-1/2" />
        </div>
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <div className="rounded-xl border p-4 flex flex-col gap-3">
        <div className="skeleton-shimmer h-32 rounded-lg w-full" />
        <div className="skeleton-shimmer h-4 rounded w-2/3" />
        <div className="skeleton-shimmer h-3 rounded w-1/2" />
      </div>
    )
  }

  // variant === 'content'
  const widths = ['w-full', 'w-5/6', 'w-4/5', 'w-3/4', 'w-2/3']
  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          'skeleton-shimmer h-4 rounded',
          widths[index % widths.length]
        )}
      />
      {index === 0 && <div className="skeleton-shimmer h-4 rounded w-full" />}
    </div>
  )
}

SkeletonLoader.displayName = 'SkeletonLoader'
