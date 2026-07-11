import { describe, expect, it } from 'vitest'

import {
  admitChatRequest,
  ChatAdmissionInputError,
  executionSearchMode,
  extractAdmissionQuery
} from './chat-admission'

describe('AI-I3B chat admission boundary', () => {
  it('extracts submitted text parts without accepting non-text parts', () => {
    expect(
      extractAdmissionQuery({
        trigger: 'submit-message',
        message: {
          role: 'user',
          parts: [
            { type: 'file', text: 'ignored' },
            { type: 'text', text: '  Explain photosynthesis.  ' }
          ]
        }
      })
    ).toBe('Explain photosynthesis.')
  })

  it('uses the latest user message for regeneration', () => {
    expect(
      extractAdmissionQuery({
        trigger: 'regenerate-message',
        messages: [
          { role: 'user', content: 'First question' },
          { role: 'assistant', content: 'First answer' },
          { role: 'user', parts: [{ type: 'text', text: 'Latest question' }] },
          { role: 'assistant', content: 'Answer being regenerated' }
        ]
      })
    ).toBe('Latest question')
  })

  it('rejects missing and oversized user queries', () => {
    expect(() => extractAdmissionQuery({ trigger: 'submit-message' })).toThrow(
      ChatAdmissionInputError
    )
    expect(() =>
      extractAdmissionQuery({
        trigger: 'submit-message',
        message: 'x'.repeat(16_001)
      })
    ).toThrow('The user query is too long.')
  })

  it.each([
    ['quick', 'quick'],
    ['adaptive', 'adaptive'],
    ['deep', 'adaptive'],
    ['critical', 'adaptive']
  ] as const)('maps canonical mode %s to execution mode %s', (mode, expected) => {
    expect(executionSearchMode(mode)).toBe(expected)
  })

  it('promotes a quick preference when the deterministic Router requires adaptive execution', async () => {
    const result = await admitChatRequest({
      query: 'Who is the current CEO of OpenAI?',
      requestedSearchMode: 'quick',
      userId: 'user-1234567890123456'
    })

    expect(result.routePlan.mode).toBe('adaptive')
    expect(result.routePlan.needsFreshness).toBe(true)
    expect(result.routePlan.needsEntityGrounding).toBe(true)
    expect(executionSearchMode(result.routePlan.mode)).toBe('adaptive')
    expect(result.scope.ownerScopeId).toMatch(/^user_[a-f0-9]{64}$/)
    expect(result.routeDigest).toMatch(/^[a-f0-9]{64}$/)
  })

  it('keeps explicit non-research chat on quick execution', async () => {
    const result = await admitChatRequest({
      query: 'Hello!',
      requestedSearchMode: 'quick',
      userId: null
    })

    expect(result.routePlan.requiresResearch).toBe(false)
    expect(result.routePlan.mode).toBe('quick')
    expect(executionSearchMode(result.routePlan.mode)).toBe('quick')
    expect(result.scope.ownerScopeId).toMatch(/^guest_[a-f0-9-]{36}$/)
  })

  it('does not expose the raw authenticated user identifier in scope binding', async () => {
    const userId = 'private-user-identifier-123456'
    const result = await admitChatRequest({
      query: 'Explain photosynthesis.',
      requestedSearchMode: 'quick',
      userId
    })

    expect(result.scope.ownerScopeId).not.toContain(userId)
  })
})
