import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock next/navigation
const mockBack = vi.fn()
const mockPush = vi.fn()
let mockPathname = '/'
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush
  }),
  usePathname: () => mockPathname
}))

// Mock the overlay stack
const mockPop = vi.fn()
let mockOverlaySize = 0
vi.mock('../use-overlay-stack', () => ({
  useOverlayStack: () => ({
    push: vi.fn(),
    pop: mockPop,
    peek: vi.fn(() => null),
    get size() {
      return mockOverlaySize
    }
  })
}))

import { _resetBackButtonGlobals, useBackButton } from '../use-back-button'

describe('useBackButton', () => {
  let mockHistoryBack: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockOverlaySize = 0
    mockPathname = '/'
    mockHistoryBack = vi.fn()
    _resetBackButtonGlobals()
    vi.stubGlobal('window', {
      ...window,
      history: { ...window.history, back: mockHistoryBack },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses history.back() when overlays are open', () => {
    mockOverlaySize = 2
    const { result } = renderHook(() => useBackButton())

    result.current.handleBack()

    expect(mockHistoryBack).toHaveBeenCalled()
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('navigates to root when at top of app stack (no prior navigation)', () => {
    mockOverlaySize = 0
    const { result } = renderHook(() => useBackButton())

    result.current.handleBack()

    expect(mockPush).toHaveBeenCalledWith('/')
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('calls custom onBack handler when provided and no overlays', () => {
    mockOverlaySize = 0
    const customHandler = vi.fn()
    const { result } = renderHook(() =>
      useBackButton({ onBack: customHandler })
    )

    result.current.handleBack()

    expect(customHandler).toHaveBeenCalled()
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('prefers overlay close over custom handler', () => {
    mockOverlaySize = 1
    const customHandler = vi.fn()
    const { result } = renderHook(() =>
      useBackButton({ onBack: customHandler })
    )

    result.current.handleBack()

    expect(mockHistoryBack).toHaveBeenCalled()
    expect(customHandler).not.toHaveBeenCalled()
  })
})
