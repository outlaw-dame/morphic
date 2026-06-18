import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock useOverlayStack
const mockPush = vi.fn()
const mockPop = vi.fn()
vi.mock('@/hooks/use-overlay-stack', () => ({
  useOverlayStack: () => ({
    push: mockPush,
    pop: mockPop,
    peek: () => null,
    size: 0
  })
}))

import { ShellSheet } from '../shell-sheet'

describe('ShellSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it('renders children when open', () => {
    render(
      <ShellSheet open onOpenChange={() => {}}>
        <p data-testid="sheet-content">Hello from sheet</p>
      </ShellSheet>
    )

    expect(screen.getByTestId('sheet-content')).toBeInTheDocument()
  })

  it('does not render content when closed', () => {
    render(
      <ShellSheet open={false} onOpenChange={() => {}}>
        <p data-testid="sheet-content">Hello</p>
      </ShellSheet>
    )

    expect(screen.queryByTestId('sheet-content')).toBeNull()
  })

  it('applies --native-radius-sheet border radius to top corners', () => {
    render(
      <ShellSheet open onOpenChange={() => {}}>
        <p>Content</p>
      </ShellSheet>
    )

    const content = document.querySelector('.shell-sheet') as HTMLElement
    if (content) {
      expect(content.style.borderTopLeftRadius).toBe(
        'var(--native-radius-sheet)'
      )
      expect(content.style.borderTopRightRadius).toBe(
        'var(--native-radius-sheet)'
      )
      expect(content.style.borderBottomLeftRadius).toBe('0')
      expect(content.style.borderBottomRightRadius).toBe('0')
    }
  })

  it('has max height of 90dvh', () => {
    render(
      <ShellSheet open onOpenChange={() => {}}>
        <p>Content</p>
      </ShellSheet>
    )

    const content = document.querySelector('.shell-sheet') as HTMLElement
    if (content) {
      expect(content.style.maxHeight).toBe('90dvh')
    }
  })

  it('renders a backdrop overlay', () => {
    render(
      <ShellSheet open onOpenChange={() => {}}>
        <p>Content</p>
      </ShellSheet>
    )

    // vaul renders an overlay with bg-black/80
    const overlay = document.querySelector('.bg-black\\/80')
    expect(overlay).not.toBeNull()
  })

  it('pushes overlay entry on open', () => {
    render(
      <ShellSheet open onOpenChange={() => {}}>
        <p>Content</p>
      </ShellSheet>
    )

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sheet',
        close: expect.any(Function)
      })
    )
  })

  it('does not push overlay entry when closed', () => {
    render(
      <ShellSheet open={false} onOpenChange={() => {}}>
        <p>Content</p>
      </ShellSheet>
    )

    expect(mockPush).not.toHaveBeenCalled()
  })

  it('has role=dialog and aria-modal on content', () => {
    render(
      <ShellSheet open onOpenChange={() => {}}>
        <p>Content</p>
      </ShellSheet>
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('includes reduced-motion transition classes', () => {
    render(
      <ShellSheet open onOpenChange={() => {}}>
        <p>Content</p>
      </ShellSheet>
    )

    const content = document.querySelector('.shell-sheet')
    expect(content?.className).toContain('motion-reduce:transition-opacity')
    expect(content?.className).toContain('motion-reduce:duration-[1ms]')
  })

  it('renders drag handle', () => {
    render(
      <ShellSheet open onOpenChange={() => {}}>
        <p>Content</p>
      </ShellSheet>
    )

    // Drag handle is a small rounded div
    const handle = document.querySelector('.h-1\\.5.w-10.rounded-full')
    expect(handle).not.toBeNull()
  })
})
