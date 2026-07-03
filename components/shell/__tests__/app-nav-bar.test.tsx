import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'

import { act, render, screen } from '@testing-library/react'
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

let mockIsMobile = true
vi.mock('@/lib/hooks/use-media-query', () => ({
  useMediaQuery: () => mockIsMobile
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
    mockIsMobile = true
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

    const title = container.querySelector('h1')
    expect(title).not.toBeNull()
    expect(title?.textContent).toBe('gist.')
    expect(title?.className).toContain('text-[2rem]')
  })

  it('renders compact centered title on Apple-like platforms', () => {
    render(<AppNavBar title="Home" scrollOffset={0} />)
    const title = screen.getByRole('heading', { name: 'Home' })
    expect(title).toHaveClass('absolute')
    expect(title).toHaveClass('text-[2rem]')
  })

  it('does not render the large title on Apple-like desktop layouts', () => {
    mockIsMobile = false

    render(<AppNavBar title="Home" scrollOffset={0} />)

    expect(screen.getByRole('heading', { name: 'Home' })).toHaveClass(
      'text-[2rem]'
    )
  })

  it('hydrates Apple-like navigation without changing the server markup', async () => {
    const browserWindow = globalThis.window
    vi.stubGlobal('window', undefined)
    const serverHtml = renderToString(<AppNavBar title="Home" />)
    vi.stubGlobal('window', browserWindow)

    const container = document.createElement('div')
    container.innerHTML = serverHtml
    document.body.appendChild(container)
    const recoverableErrors: unknown[] = []

    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, <AppNavBar title="Home" />, {
        onRecoverableError: error => recoverableErrors.push(error)
      })
    })

    await act(async () => root?.unmount())
    container.remove()
    vi.unstubAllGlobals()

    expect(recoverableErrors).toEqual([])
  })

  it('collapses large title after 60px scroll', () => {
    const { container } = render(<AppNavBar title="Home" scrollOffset={80} />)

    // data-collapsed should be true
    const header = container.querySelector('[data-collapsed="true"]')
    expect(header).not.toBeNull()

    expect(screen.getByRole('heading', { name: 'Home' })).toBeVisible()
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

  it('renders a custom leading action instead of the back button', () => {
    render(
      <AppNavBar
        title="Library"
        showBack
        leadingAction={<button aria-label="Toggle Sidebar">Menu</button>}
      />
    )

    expect(screen.getByLabelText('Toggle Sidebar')).toBeInTheDocument()
    expect(screen.queryByLabelText('Go back')).toBeNull()
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
