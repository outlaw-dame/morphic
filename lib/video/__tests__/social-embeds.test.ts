import { describe, expect, it } from 'vitest'

import {
  getBlueskyEmbedUrl,
  getLoopsEmbedUrl,
  getMastodonEmbedUrl,
  getPixelfedEmbedUrl,
  isSubstackUrl,
  isTrustedProviderIframeUrl,
  parseSafeEmbedUrl
} from '../social-embeds'

describe('social embeds', () => {
  it('rejects unsafe or local embed URLs', () => {
    expect(parseSafeEmbedUrl('javascript:alert(1)')).toBeUndefined()
    expect(parseSafeEmbedUrl('https://user@example.com/video')).toBeUndefined()
    expect(parseSafeEmbedUrl('https://localhost/video')).toBeUndefined()
    expect(parseSafeEmbedUrl('https://192.168.1.2/video')).toBeUndefined()
  })

  it('allows only trusted provider iframe URLs', () => {
    expect(
      isTrustedProviderIframeUrl('https://www.youtube.com/embed/abc123')
    ).toBe(true)
    expect(isTrustedProviderIframeUrl('https://evil.example/embed/abc')).toBe(
      false
    )
  })

  it('builds Loops embed URLs from public video links', () => {
    expect(getLoopsEmbedUrl('https://loops.video/v/abc123?t=42')).toBe(
      'https://loops.video/embed/abc123?t=42'
    )
    expect(getLoopsEmbedUrl('https://loops.video/embed/abc123')).toBe(
      'https://loops.video/embed/abc123'
    )
  })

  it('builds Pixelfed post embeds only when the source identifies Pixelfed', () => {
    expect(
      getPixelfedEmbedUrl(
        'https://pixelfed.social/p/dansup/123456789',
        'Pixelfed'
      )
    ).toBe(
      'https://pixelfed.social/p/dansup/123456789/embed?caption=true&likes=false&layout=full'
    )
    expect(
      getPixelfedEmbedUrl('https://example.com/p/user/123456789')
    ).toBeUndefined()
  })

  it('builds Mastodon status embeds only when the source identifies Mastodon', () => {
    expect(
      getMastodonEmbedUrl('https://mastodon.social/@trwnh/99664077509711321')
    ).toBe('https://mastodon.social/@trwnh/99664077509711321/embed')
    expect(
      getMastodonEmbedUrl('https://example.com/@trwnh/99664077509711321')
    ).toBeUndefined()
  })

  it('builds isolated Bluesky wrapper URLs for valid post links', () => {
    expect(
      getBlueskyEmbedUrl(
        'https://bsky.app/profile/did:plc:vjug55kidv6sye7ykr5faxxn/post/3jzn6g7ixgq2y?x=1'
      )
    ).toBe(
      '/api/embed/bluesky?url=https%3A%2F%2Fbsky.app%2Fprofile%2Fdid%3Aplc%3Avjug55kidv6sye7ykr5faxxn%2Fpost%2F3jzn6g7ixgq2y'
    )
  })

  it('detects Substack but does not fabricate unsupported iframe URLs', () => {
    expect(isSubstackUrl('https://example.substack.com/p/post')).toBe(true)
    expect(isSubstackUrl('https://example.com/p/post')).toBe(false)
  })
})
