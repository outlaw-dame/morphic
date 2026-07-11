import type { Model } from '@/lib/types/models'

import { getRolePrompt } from '@/lib/ai/prompts'
import type { ResearchMode, RoutePlan } from '@/lib/ai/schemas'

import { buildDeterministicRouteFloor } from './router-admission'

export type RouterInput = {
  query: string
  requestedMode?: ResearchMode
  availableModels?: Model[]
}

export type RouterResult = {
  routePlan: RoutePlan
  promptVersion: string
  selectedModelId: string | null
  rejectedModelCount: number
}

/**
 * Compatibility entrypoint for deterministic callers.
 *
 * AI-I3 model-assisted admission must use `admitResearchRoute`, which invokes
 * the Router through the common hardened role runner and monotonically merges
 * its proposal with this deterministic floor. This synchronous wrapper never
 * implies that a model was invoked.
 */
export function routeResearchRequest(input: RouterInput): RouterResult {
  const prompt = getRolePrompt('router')
  const routePlan = buildDeterministicRouteFloor({
    query: input.query,
    requestedMode: input.requestedMode
  })

  return {
    routePlan,
    promptVersion: prompt.version,
    selectedModelId: null,
    rejectedModelCount: input.availableModels?.length ?? 0
  }
}
