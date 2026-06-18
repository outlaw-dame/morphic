'use client'

import { useRouter } from 'next/navigation'

import { cn } from '@/lib/utils'

import { useBackButton } from '@/hooks/use-back-button'

import { NativeIcon } from '@/components/native/native-icon'
import { usePlatform } from '@/components/platform/platform-provider'

export interface AppNavBarProps {
  /** Page title displayed in the navigation bar */
  title: string
  /** Custom leading action. Defaults to back button when navigation depth > 1. */
  leadingAction?: React.ReactNode
  /** Trailing action buttons (max 3 visible, overflow goes to menu) */
  trailingActions?: React.ReactNode[]
  /** Current scroll offset from ScrollContainer — drives iOS large title collapse */
  scrollOffset?: number
  /** Whether the back button should be shown (navigation stack > 1) */
  showBack?: boolean
}

const COLLAPSE_THRESHOLD = 60

/**
 * Adaptive top navigation bar with platform-specific behavior.
 *
 * - iOS/Apple-like (<768px): large title that collapses to inline after 60px scroll
 * - Android (<768px): fixed 56px bar with bottom elevation shadow
 * - Desktop (≥768px): compact fixed-height bar with inline title
 */
export function AppNavBar({
  title,
  leadingAction,
  trailingActions = [],
  scrollOffset = 0,
  showBack = false
}: AppNavBarProps) {
  const platform = usePlatform()
  const { handleBack } = useBackButton()
  const router = useRouter()

  const isAppleMobile = platform.isAppleLike && typeof window !== 'undefined'
  const isAndroid = platform.family === 'android'
  const isCollapsed = scrollOffset >= COLLAPSE_THRESHOLD

  // Collapse progress for smooth interpolation (0 = expanded, 1 = collapsed)
  const collapseProgress = Math.min(scrollOffset / COLLAPSE_THRESHOLD, 1)

  const renderLeading = () => {
    if (leadingAction) return leadingAction
    if (!showBack) return null

    return (
      <button
        type="button"
        onClick={handleBack}
        className="flex items-center justify-center"
        style={{
          minWidth: 'var(--native-min-touch-target)',
          minHeight: 'var(--native-min-touch-target)'
        }}
        aria-label="Go back"
      >
        <NativeIcon name="arrowLeft" size={24} />
      </button>
    )
  }

  const renderTrailing = () => {
    if (trailingActions.length === 0) return null

    const visible = trailingActions.slice(0, 3)
    const hasOverflow = trailingActions.length > 3

    return (
      <div className="flex items-center gap-1">
        {visible.map((action, i) => (
          <div
            key={i}
            className="flex items-center justify-center"
            style={{
              minWidth: 'var(--native-min-touch-target)',
              minHeight: 'var(--native-min-touch-target)'
            }}
          >
            {action}
          </div>
        ))}
        {hasOverflow && (
          <button
            type="button"
            className="flex items-center justify-center"
            style={{
              minWidth: 'var(--native-min-touch-target)',
              minHeight: 'var(--native-min-touch-target)'
            }}
            aria-label="More actions"
          >
            <NativeIcon name="moreHoriz" size={24} />
          </button>
        )}
      </div>
    )
  }

  return (
    <header
      className={cn(
        'shell-nav-bar relative flex flex-col justify-end px-4',
        isAndroid && 'shadow-[0_2px_4px_rgba(0,0,0,0.08)]'
      )}
      style={{
        height:
          isAppleMobile && !isCollapsed
            ? `${96 - (96 - 52) * collapseProgress}px`
            : 'var(--native-toolbar-height)'
      }}
      data-collapsed={isCollapsed}
    >
      {/* Inline bar: always present */}
      <div
        className="flex items-center justify-between w-full"
        style={{ height: 'var(--native-toolbar-height)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {renderLeading()}
          {/* Inline title: always visible on Android/desktop, fades in on iOS collapse */}
          <h1
            className={cn(
              'font-semibold text-base truncate',
              isAppleMobile && 'transition-opacity duration-200',
              isAppleMobile && !isCollapsed && 'opacity-0',
              isAppleMobile && isCollapsed && 'opacity-100',
              !isAppleMobile && 'opacity-100'
            )}
          >
            {title}
          </h1>
        </div>
        {renderTrailing()}
      </div>

      {/* Large title: only on Apple-like mobile, fades out on collapse */}
      {isAppleMobile && (
        <div
          className="pb-2 transition-opacity duration-200"
          style={{
            opacity: 1 - collapseProgress
          }}
          aria-hidden={isCollapsed}
        >
          <h1 className="font-bold text-[34px] leading-tight truncate">
            {title}
          </h1>
        </div>
      )}
    </header>
  )
}

AppNavBar.displayName = 'AppNavBar'
