import { describe, expect, it } from 'vitest'

import type { SerperSearchResultItem } from '@/lib/types'

import { getVideoPlaybackSource } from '../embed'

function video(link: string, iframeUrl?: string): SerperSearchResultItem {
  return {
    title: 'Video',
    link,
    iframeUrl,
    snippet: '',
    imageUrl: '',
    duration: '',
    source: '',
    channel: '',
    date: '',
    position: 0
  }
}

describe('getVideoPlaybackSource', () => {
  it('uses provider-supplied iframe URLs first', () => {
    expect(
      getVideoPlaybackSource(
        video(
          'https://www.youtube.com/watch?v=abc123',
          'https://www.youtube.com/embed/provider-iframe'
        )
      )
    ).toEqual({
      kind: 'iframe',
      src: 'https://www.youtube.com/embed/provider-iframe'
    })
  })

  it('ignores untrusted provider-supplied iframe URLs', () => {
    expect(
      getVideoPlaybackSource(
        video('https://example.com/watch/1', 'https://evil.example/embed/1')
      )
    ).toEqual({ kind: 'link', src: 'https://example.com/watch/1' })
  })

  it('embeds YouTube watch, short, and youtu.be URLs', () => {
    expect(
      getVideoPlaybackSource(video('https://www.youtube.com/watch?v=abc123'))
    ).toEqual({
      kind: 'iframe',
      src: 'https://www.youtube.com/embed/abc123?enablejsapi=1'
    })

    expect(getVideoPlaybackSource(video('https://youtu.be/abc123'))).toEqual({
      kind: 'iframe',
      src: 'https://www.youtube.com/embed/abc123?enablejsapi=1'
    })
  })

  it('embeds PeerTube watch URLs on arbitrary public instances', () => {
    expect(
      getVideoPlaybackSource(
        video(
          'https://framatube.org/videos/watch/52a10666-3a18-4e73-93da-e8d3c12c305a'
        )
      )
    ).toEqual({
      kind: 'iframe',
      src: 'https://framatube.org/videos/embed/52a10666-3a18-4e73-93da-e8d3c12c305a'
    })
  })

  it('embeds Vimeo URLs and preserves unlisted hashes', () => {
    expect(
      getVideoPlaybackSource(video('https://vimeo.com/76979871?h=8272103f6e'))
    ).toEqual({
      kind: 'iframe',
      src: 'https://player.vimeo.com/video/76979871?h=8272103f6e'
    })
  })

  it('embeds Dailymotion URLs', () => {
    expect(
      getVideoPlaybackSource(video('https://www.dailymotion.com/video/x7tgcz'))
    ).toEqual({
      kind: 'iframe',
      src: 'https://www.dailymotion.com/embed/video/x7tgcz'
    })
  })

  it('embeds Twitch VODs and clips with the parent host', () => {
    expect(
      getVideoPlaybackSource(
        video('https://www.twitch.tv/videos/12345'),
        'localhost'
      )
    ).toEqual({
      kind: 'iframe',
      src: 'https://player.twitch.tv/?video=v12345&parent=localhost'
    })

    expect(
      getVideoPlaybackSource(
        video('https://clips.twitch.tv/FancyClip'),
        'morphic.sh'
      )
    ).toEqual({
      kind: 'iframe',
      src: 'https://clips.twitch.tv/embed?clip=FancyClip&parent=morphic.sh'
    })
  })

  it('embeds Owncast streams when the result identifies Owncast', () => {
    const owncastResult = video('https://watch.owncast.online/')
    owncastResult.source = 'Owncast'

    expect(getVideoPlaybackSource(owncastResult)).toEqual({
      kind: 'iframe',
      src: 'https://watch.owncast.online/embed/video'
    })

    expect(
      getVideoPlaybackSource(video('https://stream.example.com/embed/video'))
    ).toEqual({
      kind: 'iframe',
      src: 'https://stream.example.com/embed/video'
    })
  })

  it('does not classify arbitrary video result homepages as Owncast', () => {
    expect(getVideoPlaybackSource(video('https://example.com/'))).toEqual({
      kind: 'link',
      src: 'https://example.com/'
    })
  })

  it('embeds Loops videos from public video and embed URLs', () => {
    expect(
      getVideoPlaybackSource(video('https://loops.video/v/abc123'))
    ).toEqual({
      kind: 'iframe',
      src: 'https://loops.video/embed/abc123'
    })
  })

  it('embeds Pixelfed posts when the result identifies Pixelfed', () => {
    const pixelfedResult = video('https://pixelfed.social/p/dansup/123456789')
    pixelfedResult.source = 'Pixelfed'

    expect(getVideoPlaybackSource(pixelfedResult)).toEqual({
      kind: 'iframe',
      src: 'https://pixelfed.social/p/dansup/123456789/embed?caption=true&likes=false&layout=full'
    })
  })

  it('embeds Mastodon statuses when the result identifies Mastodon', () => {
    expect(
      getVideoPlaybackSource(
        video('https://mastodon.social/@trwnh/99664077509711321')
      )
    ).toEqual({
      kind: 'iframe',
      src: 'https://mastodon.social/@trwnh/99664077509711321/embed'
    })
  })

  it('uses an isolated wrapper for Bluesky post embeds', () => {
    expect(
      getVideoPlaybackSource(
        video(
          'https://bsky.app/profile/did:plc:vjug55kidv6sye7ykr5faxxn/post/3jzn6g7ixgq2y'
        )
      )
    ).toEqual({
      kind: 'iframe',
      src: '/api/embed/bluesky?url=https%3A%2F%2Fbsky.app%2Fprofile%2Fdid%3Aplc%3Avjug55kidv6sye7ykr5faxxn%2Fpost%2F3jzn6g7ixgq2y',
      isolation: 'sandboxed'
    })
  })

  it('does not fabricate Substack iframe embeds', () => {
    expect(
      getVideoPlaybackSource(video('https://example.substack.com/p/post'))
    ).toEqual({
      kind: 'link',
      src: 'https://example.substack.com/p/post'
    })
  })

  it('embeds Internet Archive details pages', () => {
    expect(
      getVideoPlaybackSource(video('https://archive.org/details/public-video'))
    ).toEqual({
      kind: 'iframe',
      src: 'https://archive.org/embed/public-video'
    })
  })

  it('plays direct public video files with a native video element', () => {
    expect(
      getVideoPlaybackSource(video('https://example.com/video.webm'))
    ).toEqual({
      kind: 'video',
      src: 'https://example.com/video.webm'
    })
  })

  it('does not return unsafe links for invalid video URLs', () => {
    expect(getVideoPlaybackSource(video('javascript:alert(1)'))).toEqual({
      kind: 'link',
      src: 'about:blank'
    })
  })
})
