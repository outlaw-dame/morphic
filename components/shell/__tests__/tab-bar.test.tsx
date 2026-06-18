import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock next/navigation
const mockPush = vi.fn()
let mockPathname = '/'
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname
}))

// Mock haptics
const mockHapticLight = vi.fn()
vi.mock('@/lib/native/haptics', () => ({
  hapticLight: () => mockHapticLight()
}))

// Mock runtime
let mockIsNative = false
vi.mock('@/lib/native/runtime', () => ({
  isNative: () => mockIsNative
}))

import { TabBar, type TabItem } from '../tab-bar'

const defaultItems: TabItem[] = [
  { icon: 'home', label: 'Home', href: '/' },
  { icon: 'search', label: 'Search', href: '/search' },
  { icon: 'library', label: 'Library', href: '/library' },
  { icon: 'settings', label: 'Settings', href: '/settings' }
]

describe('TabBar', () => {
  afterEach(() => {
    mockPathname = '/'
    mockIsNative = false
    vi.clearAllMocks()
  })

  it('renders all tab items with icons and labels', () => {
    render(<TabBar items={defaultItems} />)

    expect(screen.getByLabelText('Home')).toBeInTheDocument()
    expect(screen.getByLabelText('Search')).toBeInTheDocument()
    expect(screen.getByLabelText('Library')).toBeInTheDocument()
    expect(screen.getByLabelText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Search')).toBeInTheDocument()
  })

  it('marks active tab with aria-selected', () => {
    mockPathname = '/search'
    render(<TabBar items={defaultItems} />)

    const searchTab = screen.getByLabelText('Search')
    expect(searchTab.getAttribute('aria-selected')).toBe('true')

    const homeTab = screen.getByLabelText('Home')
    expect(homeTab.getAttribute('aria-selected')).toBe('false')
  })

  it('navigates via router.push on tab tap', () => {
    mockPathname = '/'
    render(<TabBar items={defaultItems} />)

    fireEvent.click(screen.getByLabelText('Search'))
    expect(mockPush).toHaveBeenCalledWith('/search')
  })

  it('calls onScrollToTop instead of navigating when tapping active tab', () => {
    mockPathname = '/'
    const onScrollToTop = vi.fn()

    render(<TabBar items={defaultItems} onScrollToTop={onScrollToTop} />)

    fireEvent.click(screen.getByLabelText('Home'))
    expect(onScrollToTop).toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('fires hapticLight on native runtimes', () => {
    mockIsNative = true
    mockPathname = '/'

    render(<TabBar items={defaultItems} />)

    fireEvent.click(screen.getByLabelText('Search'))
    expect(mockHapticLight).toHaveBeenCalled()
  })

  it('does not fire haptic on non-native runtimes', () => {
    mockIsNative = false
    mockPathname = '/'

    render(<TabBar items={defaultItems} />)

    fireEvent.click(screen.getByLabelText('Search'))
    expect(mockHapticLight).not.toHaveBeenCalled()
  })

  it('applies translate-y-full when hidden', () => {
    const { container } = render(<TabBar items={defaultItems} hidden />)

    const nav = container.querySelector('nav')
    expect(nav?.className).toContain('translate-y-full')
  })

  it('does not apply translate-y-full when visible', () => {
    const { container } = render(<TabBar items={defaultItems} hidden={false} />)

    const nav = container.querySelector('nav')
    expect(nav?.className).not.toContain('translate-y-full')
  })

  it('has correct height via CSS variable', () => {
    const { container } = render(<TabBar items={defaultItems} />)

    const nav = container.querySelector('nav') as HTMLElement
    expect(nav.style.height).toBe('var(--native-bottom-bar-height, 72px)')
  })

  it('all tab items have min touch target size', () => {
    render(<TabBar items={defaultItems} />)

    const homeTab = screen.getByLabelText('Home')
    expect(homeTab.style.minWidth).toBe('var(--native-min-touch-target)')
    expect(homeTab.style.minHeight).toBe('var(--native-min-touch-target)')
  })

  it('has role=tablist on the nav element', () => {
    render(<TabBar items={defaultItems} />)

    const nav = screen.getByRole('tablist')
    expect(nav).toBeInTheDocument()
  })
})
