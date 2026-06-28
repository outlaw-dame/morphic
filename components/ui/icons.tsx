'use client'

import { cn } from '@/lib/utils'

function IconLogo({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <svg
      viewBox="0 0 256 256"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('size-4', className)}
      {...props}
    >
      <rect
        x="34"
        y="34"
        width="188"
        height="188"
        rx="56"
        fill="currentColor"
      />
      <path
        d="M82 92h92M82 128h68M82 164h92"
        stroke="var(--background)"
        strokeWidth="20"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconLogoOutline({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <svg
      viewBox="0 0 256 256"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('size-4', className)}
      {...props}
    >
      <rect
        x="42"
        y="42"
        width="172"
        height="172"
        rx="52"
        fill="none"
        stroke="currentColor"
        strokeWidth="20"
      />
      <path
        d="M86 94h84M86 128h60M86 162h84"
        stroke="currentColor"
        strokeWidth="18"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconBlinkingLogo({
  className,
  ...props
}: React.ComponentProps<'svg'>) {
  return (
    <svg
      fill="currentColor"
      viewBox="0 0 256 256"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('size-4', className)}
      {...props}
    >
      <rect
        x="34"
        y="34"
        width="188"
        height="188"
        rx="56"
        fill="currentColor"
      />
      <path
        d="M82 92h92M82 128h68M82 164h92"
        stroke="var(--background)"
        strokeWidth="20"
        strokeLinecap="round"
      />
    </svg>
  )
}

export { IconBlinkingLogo, IconLogo, IconLogoOutline }
