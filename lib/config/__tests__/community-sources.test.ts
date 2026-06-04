import { describe, expect, it } from 'vitest'

import {
  buildCommunitySearchQuery,
  COMMUNITY_SOURCE_DOMAINS,
  identifyCommunitySource,
  tagCommunityResult
} from '../community-sources'

describe('community sources', () => {
  it('includes the requested forum and threadiverse domains', () => {
    expect(COMMUNITY_SOURCE_DOMAINS).toEqual(
      expect.arrayContaining([
        'piefed.world',
        'lemmy.world',
        'fedia.io',
        'community.nodebb.org',
        'meta.discourse.org',
        'tildes.net'
      ])
    )
  })

  it('builds a provider-agnostic site query', () => {
    const query = buildCommunitySearchQuery('open source search')

    expect(query).toContain('(open source search)')
    expect(query).toContain('site:piefed.world')
    expect(query).toContain('OR site:lemmy.world')
    expect(query).toContain('OR site:tildes.net')
  })

  it('identifies community results from exact and nested hostnames', () => {
    expect(identifyCommunitySource('https://lemmy.world/post/123')).toBe(
      'Lemmy'
    )
    expect(identifyCommunitySource('https://www.tildes.net/~tech')).toBe(
      'Tildes'
    )
    expect(identifyCommunitySource('https://meta.discourse.org/t/123')).toBe(
      'Discourse'
    )
    expect(identifyCommunitySource('not a url')).toBeUndefined()
  })

  it('tags matching search results as community results', () => {
    expect(
      tagCommunityResult({
        title: 'Thread',
        url: 'https://fedia.io/m/example',
        content: 'A public discussion'
      })
    ).toEqual({
      title: 'Thread',
      url: 'https://fedia.io/m/example',
      content: 'A public discussion',
      sourceType: 'community',
      communitySource: 'Mbin'
    })
  })
})
