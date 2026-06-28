import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock platform provider
let mockPlatform: Record<string, unknown> = {
  isAppleLike: true,
  family: 'apple',
  kind: 'ios',
  displayMode: 'standalone',
  isStandalone: true,
  classes: []
}
vi.mock('@/components/platform/platform-provider', () => ({
  usePlatform: () => mockPlatform
}))

// Mock useBackButton
const mockHandleBack = vi.fn()
vi.mock('@/hooks/use-back-button', () => ({
  useBackButton: () => ({ handleBack: mockHandleBack })
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  usePathname: () => '/'
}))

import { AppNavBar } from '../app-nav-bar'

describe('AppNavBar', () => {
  afterEach(() => {
    mockPlatform = {
      isAppleLike: true,
      family: 'apple',
      kind: 'ios',
      displayMode: 'standalone',
      isStandalone: true,
      classes: []
    }
    vi.clearAllMocks()
  })

  it('renders the title', () => {
    render(<AppNavBar title="Search" />)
    // Title appears (at least one instance — inline or large)
    const titles = screen.getAllByText('Search')
    expect(titles.length).toBeGreaterThan(0)
  })

  it('renders the gist wordmark with an accent dot on the home title', () => {
    const { container } = render(<AppNavBar title="gist." />)

    const wordmark = container.querySelector('[data-gist-wordmark]')
    expect(wordmark).not.toBeNull()
    expect(wordmark?.textContent).toBe('gist.')
    expect(container.querySelector('[data-gist-wordmark-accent]')).not.toBeNull()
  })

  it('renders large title on Apple-like platforms', () => {
    render(<AppNavBar title="Home" scrollOffset={0} />)
    // The large title has 34px font
    const largeTitle = document.querySelector('.text-\\[34px\\]')
    expect(largeTitle).not.toBeNull()
    expect(largeTitle?.textContent).toBe('Home')
  })

  it('collapses large title after 60px scroll', () => {
    const { container } = render(<AppNavBar title="Home" scrollOffset={80} />)

    // data-collapsed should be true
    const header = container.querySelector('[data-collapsed="true"]')
    expect(header).not.toBeNull()

    // Inline title should be visible (opacity-100)
    const inlineTitle = container.querySelector('.opacity-100')
    expect(inlineTitle).not.toBeNull()
  })

  it('renders Android variant with elevation shadow', () => {
    mockPlatform = {
      ...mockPlatform,
      isAppleLike: false,
      family: 'android',
      kind: 'android'
    }

    const { container } = render(<AppNavBar title="Search" />)

    const header = container.querySelector('header')
    expect(header?.className).toContain('shadow-')
  })

  it('does not render large title on Android', () => {
    mockPlatform = {
      ...mockPlatform,
      isAppleLike: false,
      family: 'android',
      kind: 'android'
    }

    render(<AppNavBar title="Search" scrollOffset={0} />)

    const largeTitle = document.querySelector('.text-\\[34px\\]')
    expect(largeTitle).toBeNull()
  })

  it('renders back button when showBack is true', () => {
    render(<AppNavBar title="Detail" showBack />)

    const backButton = screen.getByLabelText('Go back')
    expect(backButton).toBeInTheDocument()
  })

  it('does not render back button when showBack is false', () => {
    render(<AppNavBar title="Home" showBack={false} />)

    const backButton = screen.queryByLabelText('Go back')
    expect(backButton).toBeNull()
  })

  it('renders max 3 trailing actions plus overflow button', () => {
    const actions = [
      <button key="1">A1</button>,
      <button key="2">A2</button>,
      <button key="3">A3</button>,
      <button key="4">A4</button>
    ]

    render(<AppNavBar title="Page" trailingActions={actions} />)

    // 3 visible actions + 1 overflow
    expect(screen.getByText('A1')).toBeInTheDocument()
    expect(screen.getByText('A2')).toBeInTheDocument()
    expect(screen.getByText('A3')).toBeInTheDocument()
    expect(screen.queryByText('A4')).toBeNull()
    expect(screen.getByLabelText('More actions')).toBeInTheDocument()
  })

  it('does not show overflow when 3 or fewer actions', () => {
    const actions = [<button key="1">A1</button>, <button key="2">A2</button>]

    render(<AppNavBar title="Page" trailingActions={actions} />)

    expect(screen.queryByLabelText('More actions')).toBeNull()
  })

  it('all interactive elements have min touch target size', () => {
    render(
      <AppNavBar
        title="Detail"
        showBack
        trailingActions={[<button key="1">Act</button>]}
      />
    )

    const backButton = screen.getByLabelText('Go back')
    expect(backButton.style.minWidth).toBe('var(--native-min-touch-target)')
    expect(backButton.style.minHeight).toBe('var(--native-min-touch-target)')
  })
})
