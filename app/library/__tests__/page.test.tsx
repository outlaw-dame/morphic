import { renderToStaticMarkup } from 'react-dom/server'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  listReadingItems: vi.fn()
}))

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUserId: mocks.getCurrentUserId
}))

vi.mock('@/lib/actions/reading-items', () => ({
  listReadingItems: mocks.listReadingItems
}))

vi.mock('@/components/native/native-icon', () => ({
  NativeIcon: ({ name }: { name: string }) => (
    <span data-testid={`icon-${name}`} />
  )
}))

vi.mock('@/components/navigation/guarded-external-link', () => ({
  GuardedExternalLink: ({
    children,
    href,
    className
  }: {
    children: React.ReactNode
    href: string
    className?: string
  }) => (
    <a className={className} href={href}>
      {children}
    </a>
  )
}))

import LibraryPage from '../page'

const savedItems = [
  {
    id: 'item-1',
    userId: 'user-1',
    sourceId: 'source-1',
    url: 'https://example.com/one',
    canonicalUrl: 'https://example.com/one',
    title: 'Unread source',
    author: null,
    siteName: 'Example',
    domain: 'example.com',
    publishedAt: null,
    summary: 'An unread saved source.',
    imageUrl: null,
    faviconUrl: null,
    status: 'unread',
    savedFromChatId: null,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z')
  },
  {
    id: 'item-2',
    userId: 'user-1',
    sourceId: 'source-2',
    url: 'https://example.com/two',
    canonicalUrl: 'https://example.com/two',
    title: 'Read source',
    author: null,
    siteName: 'Example',
    domain: 'example.com',
    publishedAt: null,
    summary: 'A read saved source.',
    imageUrl: null,
    faviconUrl: null,
    status: 'read',
    savedFromChatId: null,
    createdAt: new Date('2026-06-02T00:00:00Z'),
    updatedAt: new Date('2026-06-02T00:00:00Z')
  }
] as const

describe('LibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCurrentUserId.mockResolvedValue('user-1')
    mocks.listReadingItems.mockResolvedValue({
      success: true,
      items: savedItems
    })
  })

  it('renders the signed-out empty library without querying reading items', async () => {
    mocks.getCurrentUserId.mockResolvedValue(null)

    const element = await LibraryPage({
      searchParams: Promise.resolve({})
    })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('Save sources into your library.')
    expect(html).toContain('Sign in')
    expect(mocks.listReadingItems).not.toHaveBeenCalled()
  })

  it('renders saved sources with status counts', async () => {
    const element = await LibraryPage({
      searchParams: Promise.resolve({})
    })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('2 saved')
    expect(html).toContain('Unread source')
    expect(html).toContain('Read source')
    expect(html).toContain('Unread')
    expect(html).toContain('Read')
  })

  it('filters visible saved sources by status route state', async () => {
    const element = await LibraryPage({
      searchParams: Promise.resolve({ status: 'read' })
    })
    const html = renderToStaticMarkup(element)

    expect(html).not.toContain('Unread source')
    expect(html).toContain('Read source')
    expect(html).toContain('/library?status=read')
  })
})
