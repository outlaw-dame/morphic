import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { EmptyState } from '../empty-state'

describe('EmptyState', () => {
  it('renders icon, title, and description', () => {
    render(
      <EmptyState
        icon="search"
        title="No results"
        description="Try a different search term"
      />
    )

    expect(screen.getByText('No results')).toBeInTheDocument()
    expect(screen.getByText('Try a different search term')).toBeInTheDocument()
  })

  it('renders icon at 48px size', () => {
    const { container } = render(
      <EmptyState icon="search" title="Empty" description="Nothing here" />
    )

    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('48')
    expect(svg?.getAttribute('height')).toBe('48')
  })

  it('renders action button when provided', () => {
    const onClick = vi.fn()

    render(
      <EmptyState
        icon="newChat"
        title="No chats"
        description="Start a conversation"
        action={{ label: 'New Chat', onClick }}
      />
    )

    const button = screen.getByText('New Chat')
    expect(button).toBeInTheDocument()
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalled()
  })

  it('does not render action button when not provided', () => {
    render(
      <EmptyState icon="search" title="Empty" description="Nothing here" />
    )

    const buttons = screen.queryAllByRole('button')
    expect(buttons).toHaveLength(0)
  })

  it('action button has min touch target size', () => {
    render(
      <EmptyState
        icon="search"
        title="Empty"
        description="Nothing"
        action={{ label: 'Action', onClick: () => {} }}
      />
    )

    const button = screen.getByText('Action')
    expect(button.style.minWidth).toBe('var(--native-min-touch-target)')
    expect(button.style.minHeight).toBe('var(--native-min-touch-target)')
  })

  it('is centered with flex layout', () => {
    const { container } = render(
      <EmptyState icon="search" title="Empty" description="Nothing" />
    )

    const root = container.firstChild as HTMLElement
    expect(root.className).toContain('items-center')
    expect(root.className).toContain('justify-center')
  })
})
