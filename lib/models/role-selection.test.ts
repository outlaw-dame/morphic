import { describe, expect, it } from 'vitest'

import type { Model } from '@/lib/types/models'

import { partitionModelsForRole, selectModelForRole } from './role-selection'

const models: Model[] = [
  {
    id: 'local-streaming-only',
    name: 'Local Streaming Only',
    provider: 'Ollama',
    providerId: 'ollama',
    capabilities: []
  },
  {
    id: 'local-router-ready',
    name: 'Local Router Ready',
    provider: 'Ollama',
    providerId: 'ollama',
    capabilities: ['structured_outputs']
  },
  {
    id: 'gemini-role-ready',
    name: 'Gemini Role Ready',
    provider: 'Google',
    providerId: 'google',
    capabilities: []
  }
]

describe('role-specific model selection', () => {
  it('selects the best eligible model for structured internal roles', () => {
    const result = selectModelForRole(models, 'router')

    expect(result.selected?.model.id).toBe('gemini-role-ready')
    expect(result.eligible.map(candidate => candidate.model.id)).toEqual([
      'gemini-role-ready',
      'local-router-ready'
    ])
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].model.id).toBe('local-streaming-only')
    expect(result.rejected[0].missingCapabilities).toEqual([
      'structured_output'
    ])
  })

  it('keeps answer composition compatible with streaming-only local models', () => {
    const result = selectModelForRole(models, 'answer_composer')

    expect(result.selected?.model.id).toBe('gemini-role-ready')
    expect(result.eligible.map(candidate => candidate.model.id)).toEqual([
      'gemini-role-ready',
      'local-router-ready',
      'local-streaming-only'
    ])
    expect(result.rejected).toEqual([])
  })

  it('partitions models without mutating the provided model list', () => {
    const originalOrder = models.map(model => model.id)
    const partitioned = partitionModelsForRole(models, 'advisor')

    expect(models.map(model => model.id)).toEqual(originalOrder)
    expect(partitioned.eligible.map(candidate => candidate.model.id)).toEqual([
      'gemini-role-ready',
      'local-router-ready'
    ])
  })
})
