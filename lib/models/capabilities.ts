import type { ModelCapability, ModelRole } from '@/lib/ai/schemas'
import type { Model } from '@/lib/types/models'

export type ModelCapabilityProfile = {
  providerId: string
  modelId: string
  capabilities: ModelCapability[]
  maxContextTokens?: number
  reliability: 'unknown' | 'experimental' | 'standard' | 'strong'
}

const ROLE_REQUIREMENTS: Record<ModelRole, ModelCapability[]> = {
  router: ['structured_output'],
  coordinator: ['structured_output'],
  retriever: ['tool_calling', 'streaming'],
  source_quality: ['structured_output'],
  entity_grounding: ['structured_output'],
  answer_composer: ['streaming'],
  advisor: ['structured_output'],
  citation_verifier: ['structured_output'],
  repair: ['structured_output']
}

const NVIDIA_SEARCH_COMPATIBLE_PATTERNS = [
  /^meta\/llama-3\..*-instruct$/i,
  /^nvidia\/llama-3\.1-nemotron.*instruct$/i
]

function normalizeCapability(capability: string): ModelCapability | null {
  switch (capability) {
    case 'tool_calling':
    case 'tools':
    case 'function_calling':
      return 'tool_calling'
    case 'structured_output':
    case 'structured_outputs':
      return 'structured_output'
    case 'streaming':
      return 'streaming'
    case 'reasoning':
      return 'reasoning'
    case 'vision':
    case 'image_input':
      return 'vision'
    case 'pdf_input':
    case 'pdf':
      return 'pdf_input'
    case 'json_mode':
    case 'json':
      return 'json_mode'
    case 'local_execution':
    case 'local':
      return 'local_execution'
    default:
      return null
  }
}

function uniqueCapabilities(
  capabilities: ModelCapability[]
): ModelCapability[] {
  return Array.from(new Set(capabilities))
}

function inferProviderDefaults(providerId: string): ModelCapability[] {
  switch (providerId) {
    case 'anthropic':
    case 'google':
    case 'mistral':
    case 'openai':
    case 'openai-compatible':
    case 'openrouter':
    case 'gateway':
    case 'azure':
      return ['tool_calling', 'structured_output', 'streaming', 'json_mode']
    case 'ollama':
    case 'ollama-cloud':
      return ['streaming', 'local_execution']
    case 'nvidia':
      return ['streaming']
    default:
      return ['streaming']
  }
}

function inferModelSpecificCapabilities(
  providerId: string,
  modelId: string
): ModelCapability[] {
  const normalizedId = modelId.toLowerCase()
  const capabilities: ModelCapability[] = []

  if (
    normalizedId.includes('reason') ||
    normalizedId.includes('thinking') ||
    normalizedId.includes('o1') ||
    normalizedId.includes('o3') ||
    normalizedId.includes('o4')
  ) {
    capabilities.push('reasoning')
  }

  if (
    normalizedId.includes('vision') ||
    normalizedId.includes('vl') ||
    normalizedId.includes('multimodal') ||
    normalizedId.includes('gpt-4o') ||
    normalizedId.includes('gemini') ||
    normalizedId.includes('claude')
  ) {
    capabilities.push('vision')
  }

  if (providerId === 'nvidia') {
    return NVIDIA_SEARCH_COMPATIBLE_PATTERNS.some(pattern =>
      pattern.test(modelId)
    )
      ? ['tool_calling']
      : []
  }

  return capabilities
}

export function inferModelCapabilityProfile(
  model: Pick<Model, 'capabilities' | 'id' | 'providerId'>
): ModelCapabilityProfile {
  const configuredCapabilities = (model.capabilities ?? [])
    .map(normalizeCapability)
    .filter((capability): capability is ModelCapability => Boolean(capability))

  const capabilities = uniqueCapabilities([
    ...inferProviderDefaults(model.providerId),
    ...inferModelSpecificCapabilities(model.providerId, model.id),
    ...configuredCapabilities
  ])

  return {
    providerId: model.providerId,
    modelId: model.id,
    capabilities,
    reliability: model.providerId === 'nvidia' ? 'experimental' : 'standard'
  }
}

export function modelHasCapabilities(
  profile: ModelCapabilityProfile,
  requiredCapabilities: ModelCapability[]
): boolean {
  return requiredCapabilities.every(capability =>
    profile.capabilities.includes(capability)
  )
}

export function modelSupportsRole(
  model: Pick<Model, 'capabilities' | 'id' | 'providerId'>,
  role: ModelRole
): boolean {
  return modelHasCapabilities(
    inferModelCapabilityProfile(model),
    ROLE_REQUIREMENTS[role]
  )
}

export function getMissingCapabilitiesForRole(
  model: Pick<Model, 'capabilities' | 'id' | 'providerId'>,
  role: ModelRole
): ModelCapability[] {
  const profile = inferModelCapabilityProfile(model)
  return ROLE_REQUIREMENTS[role].filter(
    capability => !profile.capabilities.includes(capability)
  )
}

export function isModelSearchCapable(
  providerId: string,
  modelId: string,
  capabilities: string[] = []
): boolean {
  if (providerId !== 'nvidia') {
    return true
  }

  return modelSupportsRole(
    {
      providerId,
      id: modelId,
      capabilities
    },
    'retriever'
  )
}
