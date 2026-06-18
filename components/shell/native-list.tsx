'use client'

import type { NativeIconName } from '@/lib/native/icon-map'
import { cn } from '@/lib/utils'

import { NativeIcon } from '@/components/native/native-icon'

export interface NativeListItemProps {
  /** Leading icon from the icon-map registry */
  icon?: NativeIconName
  /** Primary text (single line, truncated) */
  title: string
  /** Secondary text (single line, truncated) */
  subtitle?: string
  /** Trailing accessory element */
  trailing?: React.ReactNode
  /** Callback on press */
  onPress?: () => void
}

export interface NativeListProps {
  children: React.ReactNode
  /** Whether to render separator lines between items (default true) */
  separators?: boolean
  className?: string
}

/**
 * Platform-native-feeling list component.
 *
 * - Min touch target height per platform
 * - Hairline separators (inset from leading edge)
 * - Leading icon, title, subtitle, trailing accessory slots
 * - Press feedback: scale on touch, background-color on reduced-motion
 */
export function NativeList({
  children,
  separators = true,
  className
}: NativeListProps) {
  return (
    <ul
      className={cn(
        'native-list flex flex-col',
        separators && 'divide-y divide-[var(--native-hairline)]',
        className
      )}
      role="list"
    >
      {children}
    </ul>
  )
}

/**
 * Individual list item with platform-adaptive touch targets and press feedback.
 */
export function NativeListItem({
  icon,
  title,
  subtitle,
  trailing,
  onPress
}: NativeListItemProps) {
  const Component = onPress ? 'button' : 'div'

  return (
    <li className="list-none">
      <Component
        type={onPress ? 'button' : undefined}
        onClick={onPress}
        className={cn(
          'native-list-item flex items-center gap-3 w-full px-4 text-left',
          onPress &&
            'motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100',
          onPress &&
            'motion-reduce:active:bg-[var(--native-hairline)] motion-reduce:transition-none'
        )}
        style={{
          minHeight: 'var(--native-min-touch-target)'
        }}
      >
        {icon && (
          <NativeIcon
            name={icon}
            size={20}
            className="text-muted-foreground shrink-0"
          />
        )}

        <div className="flex-1 min-w-0 py-2">
          <p className="text-sm font-medium text-foreground truncate">
            {title}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>

        {trailing && <div className="shrink-0 ml-2">{trailing}</div>}
      </Component>
    </li>
  )
}

NativeList.displayName = 'NativeList'
NativeListItem.displayName = 'NativeListItem'
