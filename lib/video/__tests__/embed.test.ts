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
        video('https://example.com/watch/1', 'https://example.com/embed/1')
      )
    ).toEqual({ kind: 'iframe', src: 'https://example.com/embed/1' })
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
      getVideoPlaybackSource(video('https://www.twitch.tv/videos/12345'), 'localhost')
    ).toEqual({
      kind: 'iframe',
      src: 'https://player.twitch.tv/?video=v12345&parent=localhost'
    })

    expect(
      getVideoPlaybackSource(video('https://clips.twitch.tv/FancyClip'), 'morphic.sh')
    ).toEqual({
      kind: 'iframe',
      src: 'https://clips.twitch.tv/embed?clip=FancyClip&parent=morphic.sh'
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
    expect(getVideoPlaybackSource(video('https://example.com/video.webm'))).toEqual({
      kind: 'video',
      src: 'https://example.com/video.webm'
    })
  })
})
