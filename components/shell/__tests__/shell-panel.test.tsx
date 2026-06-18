import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Mock useOverlayStack
const mockPush = vi.fn()
vi.mock('@/hooks/use-overlay-stack', () => ({
  useOverlayStack: () => ({
    push: mockPush,
    pop: vi.fn(),
    peek: () => null,
    size: 0
  })
}))

import { ShellPanel } from '../shell-panel'

describe('ShellPanel', () => {
  it('renders children', () => {
    render(
      <ShellPanel open onOpenChange={() => {}}>
        <div data-testid="panel-content">Panel content</div>
      </ShellPanel>
    )

    expect(screen.getByTestId('panel-content')).toBeInTheDocument()
  })

  it('applies left positioning by default', () => {
    const { container } = render(
      <ShellPanel open onOpenChange={() => {}}>
        <div>Content</div>
      </ShellPanel>
    )

    const panel = container.querySelector('.shell-panel')
    expect(panel?.className).toContain('left-0')
  })

  it('applies right positioning when side=right', () => {
    const { container } = render(
      <ShellPanel open onOpenChange={() => {}} side="right">
        <div>Content</div>
      </ShellPanel>
    )

    const panel = container.querySelector('.shell-panel')
    expect(panel?.className).toContain('right-0')
  })

  it('applies translate-x-0 when open', () => {
    const { container } = render(
      <ShellPanel open onOpenChange={() => {}}>
        <div>Content</div>
      </ShellPanel>
    )

    const panel = container.querySelector('.shell-panel')
    expect(panel?.className).toContain('translate-x-0')
  })

  it('applies -translate-x-full when closed (left side)', () => {
    const { container } = render(
      <ShellPanel open={false} onOpenChange={() => {}}>
        <div>Content</div>
      </ShellPanel>
    )

    const panel = container.querySelector('.shell-panel')
    expect(panel?.className).toContain('-translate-x-full')
  })

  it('applies translate-x-full when closed (right side)', () => {
    const { container } = render(
      <ShellPanel open={false} onOpenChange={() => {}} side="right">
        <div>Content</div>
      </ShellPanel>
    )

    const panel = container.querySelector('.shell-panel')
    expect(panel?.className).toContain('translate-x-full')
  })

  it('renders backdrop when open', () => {
    const { container } = render(
      <ShellPanel open onOpenChange={() => {}}>
        <div>Content</div>
      </ShellPanel>
    )

    const backdrop = container.querySelector('.shell-panel-backdrop')
    expect(backdrop).not.toBeNull()
  })

  it('does not render backdrop when closed', () => {
    const { container } = render(
      <ShellPanel open={false} onOpenChange={() => {}}>
        <div>Content</div>
      </ShellPanel>
    )

    const backdrop = container.querySelector('.shell-panel-backdrop')
    expect(backdrop).toBeNull()
  })

  it('calls onOpenChange(false) when backdrop is clicked', () => {
    const onOpenChange = vi.fn()

    const { container } = render(
      <ShellPanel open onOpenChange={onOpenChange}>
        <div>Content</div>
      </ShellPanel>
    )

    const backdrop = container.querySelector('.shell-panel-backdrop')!
    fireEvent.click(backdrop)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('applies safe-area padding on left edge', () => {
    const { container } = render(
      <ShellPanel open onOpenChange={() => {}} side="left">
        <div>Content</div>
      </ShellPanel>
    )

    const panel = container.querySelector('.shell-panel') as HTMLElement
    expect(panel.style.paddingLeft).toBe('var(--native-safe-left)')
  })

  it('applies safe-area padding on right edge', () => {
    const { container } = render(
      <ShellPanel open onOpenChange={() => {}} side="right">
        <div>Content</div>
      </ShellPanel>
    )

    const panel = container.querySelector('.shell-panel') as HTMLElement
    expect(panel.style.paddingRight).toBe('var(--native-safe-right)')
  })

  it('has max-w-[85vw] for mobile constraint', () => {
    const { container } = render(
      <ShellPanel open onOpenChange={() => {}}>
        <div>Content</div>
      </ShellPanel>
    )

    const panel = container.querySelector('.shell-panel')
    expect(panel?.className).toContain('max-w-[85vw]')
  })

  it('includes reduced-motion transition classes', () => {
    const { container } = render(
      <ShellPanel open onOpenChange={() => {}}>
        <div>Content</div>
      </ShellPanel>
    )

    const panel = container.querySelector('.shell-panel')
    expect(panel?.className).toContain('motion-reduce:transition-opacity')
    expect(panel?.className).toContain('motion-reduce:duration-[1ms]')
  })

  it('has role=complementary', () => {
    render(
      <ShellPanel open onOpenChange={() => {}}>
        <div>Content</div>
      </ShellPanel>
    )

    const panel = screen.getByRole('complementary')
    expect(panel).toBeInTheDocument()
  })
})
