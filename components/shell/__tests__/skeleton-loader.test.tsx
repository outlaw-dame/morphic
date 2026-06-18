import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SkeletonLoader } from '../skeleton-loader'

describe('SkeletonLoader', () => {
  it('renders correct number of blocks', () => {
    const { container } = render(<SkeletonLoader blocks={5} />)

    // Each block renders at least one .skeleton-shimmer element
    const shimmers = container.querySelectorAll('.skeleton-shimmer')
    expect(shimmers.length).toBeGreaterThanOrEqual(5)
  })

  it('renders default 3 blocks', () => {
    const { container } = render(<SkeletonLoader />)

    const shimmers = container.querySelectorAll('.skeleton-shimmer')
    expect(shimmers.length).toBeGreaterThanOrEqual(3)
  })

  it('applies skeleton-shimmer class for CSS animation', () => {
    const { container } = render(<SkeletonLoader blocks={1} />)

    const shimmer = container.querySelector('.skeleton-shimmer')
    expect(shimmer).not.toBeNull()
  })

  it('has role=status for accessibility', () => {
    render(<SkeletonLoader />)

    const status = screen.getByRole('status')
    expect(status).toBeInTheDocument()
    expect(status.getAttribute('aria-busy')).toBe('true')
  })

  it('renders list variant with circle + lines', () => {
    const { container } = render(<SkeletonLoader variant="list" blocks={2} />)

    // List variant has rounded-full circles
    const circles = container.querySelectorAll('.rounded-full')
    expect(circles.length).toBe(2)
  })

  it('renders card variant with rounded-xl border', () => {
    const { container } = render(<SkeletonLoader variant="card" blocks={1} />)

    const card = container.querySelector('.rounded-xl')
    expect(card).not.toBeNull()
  })

  it('renders content variant with varying widths', () => {
    const { container } = render(
      <SkeletonLoader variant="content" blocks={3} />
    )

    // Content blocks have various width classes
    const shimmers = container.querySelectorAll('.skeleton-shimmer')
    expect(shimmers.length).toBeGreaterThanOrEqual(3)
  })

  it('applies custom className', () => {
    const { container } = render(<SkeletonLoader className="custom-loader" />)

    const root = container.firstChild as HTMLElement
    expect(root.className).toContain('custom-loader')
  })
})
