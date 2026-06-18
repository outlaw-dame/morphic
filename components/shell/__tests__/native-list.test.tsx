import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NativeList, NativeListItem } from '../native-list'

describe('NativeList', () => {
  it('renders children', () => {
    render(
      <NativeList>
        <NativeListItem title="Item 1" />
        <NativeListItem title="Item 2" />
      </NativeList>
    )

    expect(screen.getByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Item 2')).toBeInTheDocument()
  })

  it('renders with separators by default', () => {
    const { container } = render(
      <NativeList>
        <NativeListItem title="A" />
      </NativeList>
    )

    const list = container.querySelector('.native-list')
    expect(list?.className).toContain('divide-y')
  })

  it('hides separators when separators=false', () => {
    const { container } = render(
      <NativeList separators={false}>
        <NativeListItem title="A" />
      </NativeList>
    )

    const list = container.querySelector('.native-list')
    expect(list?.className).not.toContain('divide-y')
  })

  it('has role=list', () => {
    render(
      <NativeList>
        <NativeListItem title="A" />
      </NativeList>
    )

    expect(screen.getByRole('list')).toBeInTheDocument()
  })
})

describe('NativeListItem', () => {
  it('renders title', () => {
    render(
      <NativeList>
        <NativeListItem title="Settings" />
      </NativeList>
    )

    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    render(
      <NativeList>
        <NativeListItem title="Account" subtitle="Manage your profile" />
      </NativeList>
    )

    expect(screen.getByText('Manage your profile')).toBeInTheDocument()
  })

  it('renders leading icon when provided', () => {
    const { container } = render(
      <NativeList>
        <NativeListItem icon="settings" title="Settings" />
      </NativeList>
    )

    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
  })

  it('renders trailing accessory', () => {
    render(
      <NativeList>
        <NativeListItem
          title="WiFi"
          trailing={<span data-testid="badge">On</span>}
        />
      </NativeList>
    )

    expect(screen.getByTestId('badge')).toBeInTheDocument()
  })

  it('calls onPress when clicked', () => {
    const onPress = vi.fn()

    render(
      <NativeList>
        <NativeListItem title="Clickable" onPress={onPress} />
      </NativeList>
    )

    fireEvent.click(screen.getByText('Clickable'))
    expect(onPress).toHaveBeenCalled()
  })

  it('renders as button when onPress is provided', () => {
    render(
      <NativeList>
        <NativeListItem title="Pressable" onPress={() => {}} />
      </NativeList>
    )

    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
  })

  it('renders as div when onPress is not provided', () => {
    render(
      <NativeList>
        <NativeListItem title="Static" />
      </NativeList>
    )

    const buttons = screen.queryAllByRole('button')
    expect(buttons).toHaveLength(0)
  })

  it('has min touch target height', () => {
    const { container } = render(
      <NativeList>
        <NativeListItem title="Item" onPress={() => {}} />
      </NativeList>
    )

    const item = container.querySelector('.native-list-item') as HTMLElement
    expect(item.style.minHeight).toBe('var(--native-min-touch-target)')
  })

  it('has press scale feedback classes when interactive', () => {
    const { container } = render(
      <NativeList>
        <NativeListItem title="Press me" onPress={() => {}} />
      </NativeList>
    )

    const item = container.querySelector('.native-list-item')
    expect(item?.className).toContain('motion-safe:active:scale-[0.97]')
  })

  it('has reduced-motion background fallback when interactive', () => {
    const { container } = render(
      <NativeList>
        <NativeListItem title="Press me" onPress={() => {}} />
      </NativeList>
    )

    const item = container.querySelector('.native-list-item')
    expect(item?.className).toContain(
      'motion-reduce:active:bg-[var(--native-hairline)]'
    )
  })

  it('truncates title with ellipsis (truncate class)', () => {
    const { container } = render(
      <NativeList>
        <NativeListItem title="Very long title text" />
      </NativeList>
    )

    const titleEl = container.querySelector('.truncate')
    expect(titleEl).not.toBeNull()
  })
})
