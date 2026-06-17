import type { UIMessage } from 'ai'
import { describe, expect, it } from 'vitest'

import { calculateConversationTurn } from '@/lib/analytics/utils'

const userMsg = (id: string): UIMessage => ({ id, role: 'user', parts: [] })
const assistantMsg = (id: string): UIMessage => ({
  id,
  role: 'assistant',
  parts: []
})

describe('calculateConversationTurn', () => {
  const history = [userMsg('u1'), assistantMsg('a1')]

  it('counts the current message once when history excludes it', () => {
    expect(calculateConversationTurn(history, 'u2')).toBe(2)
  })

  it('counts the current message once when history already includes it', () => {
    const fresh = [...history, userMsg('u2')]
    expect(calculateConversationTurn(fresh, 'u2')).toBe(2)
  })

  it('returns at least 1', () => {
    expect(calculateConversationTurn([], 'u1')).toBe(1)
    expect(calculateConversationTurn([])).toBe(1)
  })

  it('counts existing user messages without a current id', () => {
    const fresh = [...history, userMsg('u2')]
    expect(calculateConversationTurn(fresh)).toBe(2)
  })
})
