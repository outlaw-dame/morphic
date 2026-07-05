import { describe, expect, it } from 'vitest'

import type { Model } from '@/lib/types/models'

import { routeResearchRequest } from './router'

const models: Model[] = [
  {
    id: 'local-streaming-only',
    name: 'Local Streaming Only',
    provider: 'Ollama',
    providerId: 'ollama',
    capabilities: []
  },
  {
    id: 'router-ready',
    name: 'Router Ready',
    provider: 'Google',
    providerId: 'google',
    capabilities: []
  }
]

describe('deterministic AI router', () => {
  it('routes simple stable requests as quick low-risk plans', () => {
    const result = routeResearchRequest({
      query: 'Explain what a dissertation is.',
      availableModels: models
    })

    expect(result.routePlan.mode).toBe('quick')
    expect(result.routePlan.riskLevel).toBe('low')
    expect(result.routePlan.requiredModelRoles).toContain('router')
    expect(result.routePlan.requiredModelRoles).toContain('retriever')
    expect(result.routePlan.requiredModelRoles).toContain('answer_composer')
    expect(result.routePlan.requiredModelRoles).toContain('repair')
    expect(result.routePlan.needsCitationVerification).toBe(true)
    expect(result.routePlan.needsEntityGrounding).toBe(false)
    expect(result.selectedModelId).toBe('router-ready')
  })

  it('routes current requests through adaptive freshness-aware plans', () => {
    const result = routeResearchRequest({
      query: 'Find the latest pricing and schedule for this product release in 2030.',
      availableModels: models
    })

    expect(result.routePlan.mode).toBe('adaptive')
    expect(result.routePlan.needsFreshness).toBe(true)
    expect(result.routePlan.maxToolCalls).toBe(35)
  })

  it('routes high-risk requests through critical advisor-reviewed plans', () => {
    const result = routeResearchRequest({
      query: 'What should I know about an insurance settlement and medical treatment after a crash?',
      availableModels: models
    })

    expect(result.routePlan.mode).toBe('critical')
    expect(result.routePlan.riskLevel).toBe('high')
    expect(result.routePlan.needsAdvisorReview).toBe(true)
    expect(result.routePlan.requiredModelRoles).toContain('advisor')
    expect(result.routePlan.requiredModelRoles).toContain('citation_verifier')
    expect(result.routePlan.requiredModelRoles).toContain('repair')
    expect(result.routePlan.maxToolCalls).toBe(50)
  })

  it('honors an explicit requested mode while preserving risk gates', () => {
    const result = routeResearchRequest({
      query: 'Check current legal policy updates.',
      requestedMode: 'adaptive',
      availableModels: []
    })

    expect(result.routePlan.mode).toBe('adaptive')
    expect(result.routePlan.riskLevel).toBe('high')
    expect(result.routePlan.needsAdvisorReview).toBe(true)
    expect(result.selectedModelId).toBeNull()
    expect(result.rejectedModelCount).toBe(0)
  })

  it('does not over-escalate broad court or treatment phrases', () => {
    const result = routeResearchRequest({
      query: 'Compare basketball court options and spa treatment prices.',
      availableModels: models
    })

    expect(result.routePlan.riskLevel).toBe('low')
    expect(result.routePlan.needsEntityGrounding).toBe(false)
  })

  it('rejects empty queries', () => {
    expect(() =>
      routeResearchRequest({
        query: '   ',
        availableModels: models
      })
    ).toThrow('Query cannot be empty')
  })
})
