import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createRouteExecutionContext,
  digestRoutePlan
} from '@/lib/ai/router/execution-context'
import { buildDeterministicRouteFloor } from '@/lib/ai/router/router-admission'

const { runProductionGovernedChain } = vi.hoisted(() => ({
  runProductionGovernedChain: vi.fn()
}))

vi.mock('../agents/coordinator/production-governed-chain', () => ({
  runProductionGovernedChain
}))

import { createGovernedProductionStreamResponse } from './create-governed-production-stream-response'

function context(query = 'Research current concussion treatment guidance') {
  const routePlan = buildDeterministicRouteFloor({ query })
  return createRouteExecutionContext({
    routePlan,
    routeDigest: digestRoutePlan(routePlan)
  })
}

function chainInput(routeContext: ReturnType<typeof context>) {
  return {
    query: 'Research current concussion treatment guidance',
    routeContext,
    retrieval: { retrieve: vi.fn() },
    composition: { compose: vi.fn() },
    advisor: { review: vi.fn() },
    citationVerifier: { verify: vi.fn() }
  }
}

function released(routeContext: ReturnType<typeof context>, draft: string) {
  return Object.freeze({
    status: 'released' as const,
    routeDigest: routeContext.routeDigest,
    executionId: 'execution_00000001',
    draft,
    citedEvidenceIds: Object.freeze(['evidence-1']),
    composerOutputDigest: 'a'.repeat(64),
    advisorOutputDigest: 'b'.repeat(64),
    citationVerifierOutputDigest: 'c'.repeat(64),
    releasedAt: new Date().toISOString()
  })
}

describe('governed production stream response', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not emit draft text before the governed chain releases it', async () => {
    const routeContext = context()
    let resolveRelease:
      | ((value: ReturnType<typeof released>) => void)
      | undefined
    runProductionGovernedChain.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRelease = resolve
      })
    )

    const response = createGovernedProductionStreamResponse({
      routeContext,
      chain: chainInput(routeContext)
    })
    const reader = response.body!.getReader()
    const firstRead = reader.read()

    const early = await Promise.race([
      firstRead.then(() => 'emitted'),
      new Promise<'pending'>((resolve) =>
        setTimeout(() => resolve('pending'), 20)
      )
    ])
    expect(early).toBe('pending')

    resolveRelease?.(released(routeContext, 'Approved governed answer.'))
    const chunks: Uint8Array[] = []
    let current = await firstRead
    while (!current.done) {
      chunks.push(current.value)
      current = await reader.read()
    }
    const body = new TextDecoder().decode(
      chunks.reduce((all, chunk) => {
        const next = new Uint8Array(all.length + chunk.length)
        next.set(all)
        next.set(chunk, all.length)
        return next
      }, new Uint8Array())
    )
    expect(body).toContain('Approved governed answer.')
  })

  it('never exposes draft-like provider data when governed execution fails', async () => {
    const routeContext = context()
    runProductionGovernedChain.mockRejectedValueOnce(
      new Error('secret unapproved draft: do not expose')
    )

    const response = createGovernedProductionStreamResponse({
      routeContext,
      chain: chainInput(routeContext)
    })
    const body = await response.text()

    expect(body).toContain('The governed response could not be released.')
    expect(body).not.toContain('secret unapproved draft')
  })

  it('rejects a mismatched route context before governed execution', () => {
    const routeContext = context()
    const otherContext = context('Research a completely different topic')

    expect(() =>
      createGovernedProductionStreamResponse({
        routeContext,
        chain: chainInput(otherContext)
      })
    ).toThrow('Governed production stream route context mismatch.')
    expect(runProductionGovernedChain).not.toHaveBeenCalled()
  })
})
