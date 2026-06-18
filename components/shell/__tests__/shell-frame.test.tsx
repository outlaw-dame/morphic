import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock useKeyboardState
let mockKeyboardOpen = false
vi.mock('@/hooks/use-keyboard-state', () => ({
  useKeyboardState: () => ({
    isOpen: mockKeyboardOpen,
    height: mockKeyboardOpen ? 300 : 0
  })
}))

import { ShellFrame } from '../shell-frame'

describe('ShellFrame', () => {
  afterEach(() => {
    mockKeyboardOpen = false
  })

  it('renders children in the middle zone', () => {
    render(
      <ShellFrame>
        <div data-testid="page-content">Hello</div>
      </ShellFrame>
    )

    expect(screen.getByTestId('page-content')).toBeInTheDocument()
  })

  it('renders navBar slot in the top zone', () => {
    render(
      <ShellFrame navBar={<nav data-testid="nav-bar">Nav</nav>}>
        <div>Content</div>
      </ShellFrame>
    )

    expect(screen.getByTestId('nav-bar')).toBeInTheDocument()
  })

  it('renders tabBar slot in the bottom zone', () => {
    render(
      <ShellFrame tabBar={<div data-testid="tab-bar">Tabs</div>}>
        <div>Content</div>
      </ShellFrame>
    )

    expect(screen.getByTestId('tab-bar')).toBeInTheDocument()
  })

  it('applies 100dvh height and overflow hidden to root', () => {
    const { container } = render(
      <ShellFrame>
        <div>Content</div>
      </ShellFrame>
    )

    const frame = container.firstChild as HTMLElement
    expect(frame.style.height).toBe('100dvh')
    expect(frame.className).toContain('overflow-hidden')
  })

  it('applies safe-area padding-top via CSS variable', () => {
    const { container } = render(
      <ShellFrame>
        <div>Content</div>
      </ShellFrame>
    )

    const frame = container.firstChild as HTMLElement
    expect(frame.style.paddingTop).toBe('var(--native-safe-top)')
  })

  it('applies translate-y-full to tabBar when keyboard is open', () => {
    mockKeyboardOpen = true

    const { container } = render(
      <ShellFrame tabBar={<div data-testid="tab-bar">Tabs</div>}>
        <div>Content</div>
      </ShellFrame>
    )

    // The tabBar wrapper should have translate-y-full class
    const tabBarWrapper = container.querySelector('[class*="translate-y-full"]')
    expect(tabBarWrapper).not.toBeNull()
  })

  it('does not apply translate when keyboard is closed', () => {
    mockKeyboardOpen = false

    const { container } = render(
      <ShellFrame tabBar={<div data-testid="tab-bar">Tabs</div>}>
        <div>Content</div>
      </ShellFrame>
    )

    const tabBarWrapper = container.querySelector('[class*="translate-y-full"]')
    expect(tabBarWrapper).toBeNull()
  })

  it('renders three zones in correct order: nav, content, tab', () => {
    const { container } = render(
      <ShellFrame
        navBar={<div data-testid="nav">Nav</div>}
        tabBar={<div data-testid="tab">Tab</div>}
      >
        <div data-testid="content">Content</div>
      </ShellFrame>
    )

    const frame = container.firstChild as HTMLElement
    const children = Array.from(frame.children)

    // First child is the nav wrapper
    expect(children[0]).toContainElement(screen.getByTestId('nav'))
    // Second is content wrapper
    expect(children[1]).toContainElement(screen.getByTestId('content'))
    // Third is tab wrapper
    expect(children[2]).toContainElement(screen.getByTestId('tab'))
  })

  it('hides tabBar on md breakpoint via md:hidden class', () => {
    const { container } = render(
      <ShellFrame tabBar={<div>Tabs</div>}>
        <div>Content</div>
      </ShellFrame>
    )

    const frame = container.firstChild as HTMLElement
    const tabWrapper = frame.children[1] // second child when no navBar... let's check
    // With tabBar present and no navBar, it's: content (0), tabBar (1)
    // With navBar present too, it would be: navBar (0), content (1), tabBar (2)
    const lastChild = frame.lastElementChild as HTMLElement
    expect(lastChild.className).toContain('md:hidden')
  })
})
