import React from 'react'

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { SearchResults } from '../search-results'

vi.mock('@/components/navigation/guarded-external-link', () => ({
  GuardedExternalLink: ({
    children,
    href
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>
}))

const results = [
  {
    title: 'Reuters world news',
    url: 'https://www.reuters.com/world/',
    content: 'Latest world updates from Reuters.'
  },
  {
    title: 'BBC World',
    url: 'https://www.bbc.com/news/world',
    content: 'World news from the BBC.'
  },
  {
    title: 'AP News',
    url: 'https://apnews.com/world-news',
    content: 'Associated Press world coverage.'
  },
  {
    title: 'Invalid but displayable',
    url: 'not a valid url',
    content: 'This result should not crash rendering.'
  }
]

describe('SearchResults', () => {
  test('renders the Gist source grid with a view-more control', () => {
    render(<SearchResults results={results} />)

    expect(screen.getByTestId('search-results-grid')).toBeInTheDocument()
    expect(screen.getByText('Reuters world news')).toBeInTheDocument()
    expect(screen.queryByText('Invalid but displayable')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'View 1 more' }))

    expect(screen.getByText('Invalid but displayable')).toBeInTheDocument()
  })

  test('renders list mode without throwing on invalid URLs', () => {
    render(<SearchResults results={results} displayMode="list" />)

    expect(screen.getByTestId('search-results-list')).toBeInTheDocument()
    expect(screen.getByText('Invalid but displayable')).toBeInTheDocument()
    expect(
      screen.getByText('This result should not crash rendering.')
    ).toBeInTheDocument()
  })
})
