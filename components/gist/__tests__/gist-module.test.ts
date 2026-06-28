import { describe, expect, it } from 'vitest'

import type { NormalizedSource } from '@/lib/sources/source-types'

import { buildGistCards } from '@/components/gist/gist-module'

function source(overrides: Partial<NormalizedSource>): NormalizedSource {
  return {
    id: overrides.id ?? 'source',
    kind: overrides.kind ?? 'news',
    title: overrides.title ?? 'Source title',
    retrievalMethod: overrides.retrievalMethod ?? 'search',
    ...overrides
  }
}

describe('buildGistCards', () => {
  it('builds a paragraph without joining separate source claims into a false run-on sentence', () => {
    const cards = buildGistCards([
      source({
        id: 'france-norway',
        title: 'Dembele scores hat-trick as France beat Norway',
        summary:
          "Dembele scores hat-trick as France beat Norway 4-1 to top World Cup group ... France's forward Ousmane Dembele shoots and scores his team's third goal during Neymar made an emotional return for Brazil in their 3-0 victory over Scotland on Wednesday."
      }),
      source({
        id: 'brazil-scotland',
        title: 'Neymar returns for Brazil',
        summary:
          'Neymar made an emotional return for Brazil in their 3-0 victory over Scotland on Wednesday.'
      }),
      source({
        id: 'fifa-world-cup',
        title: 'FIFA World Cup 2026 news',
        summary:
          'Visit FIFA.com to find the latest news, interviews, key stats, fixtures and results for the FIFA World Cup 2026.'
      })
    ])

    const summary = cards.find(card => card.id === 'gist-summary')

    expect(summary?.body).toContain(
      'Dembele scores hat-trick as France beat Norway 4-1 to top World Cup group.'
    )
    expect(summary?.body).toContain(
      'Neymar made an emotional return for Brazil in their 3-0 victory over Scotland on Wednesday.'
    )
    expect(summary?.body).not.toContain('...')
    expect(summary?.body).not.toContain('during Neymar')
    expect(summary?.body).not.toContain('\n')
  })
})
