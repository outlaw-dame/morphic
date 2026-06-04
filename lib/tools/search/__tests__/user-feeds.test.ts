import { describe, expect, test } from 'vitest'

import { parsePodcastTranscript } from '../user-feeds'

describe('parsePodcastTranscript', () => {
  test('parses VTT transcript cues with timestamps', () => {
    const segments = parsePodcastTranscript(
      `WEBVTT

00:00:04.000 --> 00:00:07.500
Welcome to the episode.

00:01:12.250 --> 00:01:16.000
The answer is in the feed transcript.`,
      'text/vtt'
    )

    expect(segments).toEqual([
      {
        text: 'Welcome to the episode.',
        startTime: 4,
        endTime: 7.5
      },
      {
        text: 'The answer is in the feed transcript.',
        startTime: 72.25,
        endTime: 76
      }
    ])
  })

  test('parses JSON transcript segments', () => {
    const segments = parsePodcastTranscript(
      JSON.stringify({
        segments: [
          { startTime: 3, endTime: 6, body: 'First segment' },
          { start_time: '00:00:09.500', duration: 2, text: 'Second segment' }
        ]
      }),
      'application/json'
    )

    expect(segments).toEqual([
      { text: 'First segment', startTime: 3, endTime: 6 },
      { text: 'Second segment', startTime: 9.5, endTime: 11.5 }
    ])
  })
})
