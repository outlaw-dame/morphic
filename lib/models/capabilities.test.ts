import { describe, expect, it } from 'vitest'

import {
  getMissingCapabilitiesForRole,
  inferModelCapabilityProfile,
  isModelSearchCapable,
  modelSupportsRole
} from './capabilities'

describe('model capability profiles', () => {
  it('infers standard provider defaults for hosted tool-capable providers', () => {
    const profile = inferModelCapabilityProfile({
      providerId: 'google',
      id: 'gemini-3-flash-preview',
      capabilities: []
    })

    expect(profile.capabilities).toContain('tool_calling')
    expect(profile.capabilities).toContain('structured_output')
    expect(profile.capabilities).toContain('streaming')
    expect(profile.reliability).toBe('standard')
  })

  it('preserves configured model capabilities when present', () => {
    const profile = inferModelCapabilityProfile({
      providerId: 'ollama',
      id: 'local-json-model',
      capabilities: ['structured_outputs', 'function_calling']
    })

    expect(profile.capabilities).toContain('local_execution')
    expect(profile.capabilities).toContain('structured_output')
    expect(profile.capabilities).toContain('tool_calling')
  })

  it('preserves legacy search compatibility for non-NVIDIA providers', () => {
    expect(isModelSearchCapable('ollama', 'local-streaming-model')).toBe(true)
    expect(isModelSearchCapable('google', 'gemini-3-flash-preview')).toBe(true)
  })

  it('keeps NVIDIA search compatibility scoped to known models', () => {
    expect(isModelSearchCapable('nvidia', 'meta/llama-3.1-8b-instruct')).toBe(
      true
    )
    expect(isModelSearchCapable('nvidia', 'meta/llama-3.1-8b-base')).toBe(false)
  })

  it('preserves NVIDIA model-specific capabilities when adding search compatibility', () => {
    const profile = inferModelCapabilityProfile({
      providerId: 'nvidia',
      id: 'nvidia/llama-3.1-nemotron-reason-vision-instruct',
      capabilities: []
    })

    expect(profile.capabilities).toContain('tool_calling')
    expect(profile.capabilities).toContain('reasoning')
    expect(profile.capabilities).toContain('vision')
  })

  it('reports role support and missing capabilities', () => {
    const localStreamingOnly = {
      providerId: 'ollama',
      id: 'local-streaming-model',
      capabilities: []
    }

    expect(modelSupportsRole(localStreamingOnly, 'answer_composer')).toBe(true)
    expect(modelSupportsRole(localStreamingOnly, 'router')).toBe(false)
    expect(getMissingCapabilitiesForRole(localStreamingOnly, 'router')).toEqual(
      ['structured_output']
    )
  })
})
