import { isModelSearchCapable } from './capabilities'

export function isSearchCompatibleModel(
  providerId: string,
  modelId: string,
  capabilities: string[] = []
): boolean {
  return isModelSearchCapable(providerId, modelId, capabilities)
}

export function getSearchModelPreferenceScore(
  providerId: string,
  modelId: string
): number {
  if (providerId === 'nvidia') {
    const normalizedId = modelId.toLowerCase()
    if (normalizedId === 'meta/llama-3.1-8b-instruct') return 0
    if (normalizedId === 'meta/llama-3.1-70b-instruct') return 10
    if (
      normalizedId.includes('nemotron') &&
      normalizedId.includes('instruct')
    ) {
      return 20
    }
  }

  return 100
}
