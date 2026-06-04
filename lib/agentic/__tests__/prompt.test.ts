import { describe, expect, it } from 'vitest'

import {
  getAdaptiveModePrompt,
  getQuickModePrompt
} from '@/lib/agents/prompts/search-mode-prompts'

describe('Morphic Evidence Graph prompt contract', () => {
  it('adds evidence graph rules to adaptive mode', () => {
    const prompt = getAdaptiveModePrompt()

    expect(prompt).toContain('MORPHIC EVIDENCE GRAPH')
    expect(prompt).toContain(
      'classify → plan → route → collect → verify → synthesize'
    )
    expect(prompt).toContain('Do not cite unsupported claims')
  })

  it('does not add the heavier evidence graph rules to quick mode', () => {
    expect(getQuickModePrompt()).not.toContain('MORPHIC EVIDENCE GRAPH')
  })
})
