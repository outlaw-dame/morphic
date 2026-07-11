import { describe, expect, it } from 'vitest'

import { buildDeterministicRouteFloor } from '@/lib/ai/router/router-admission'
import {
  createRouteExecutionContext,
  digestRoutePlan
} from '@/lib/ai/router/execution-context'
import { createEphemeralChatStreamResponse } from '@/lib/streaming/create-ephemeral-chat-stream-response'

function routeContext() {
  const routePlan = buildDeterministicRouteFloor({ query: 'Hello!' })
  return createRouteExecutionContext({
    routePlan,
    routeDigest: digestRoutePlan(routePlan)
  })
}

describe('createEphemeralChatStreamResponse', () => {
  it('returns 400 when messages are missing', async () => {
    const response = await createEphemeralChatStreamResponse({
      messages: [],
      model: { providerId: 'openai', id: 'gpt-4o-mini' } as any,
      abortSignal: new AbortController().signal,
      searchMode: 'quick',
      routeContext: routeContext()
    })

    expect(response.status).toBe(400)
    const text = await response.text()
    expect(text).toBe('messages are required')
  })
})
