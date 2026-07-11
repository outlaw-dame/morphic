import type { RouteExecutionContext } from '@/lib/ai/router/execution-context'

export type GovernedProductionRolloutDecision = Readonly<{
  enabled: boolean
  useGovernedChain: boolean
  reason:
    | 'disabled'
    | 'non_research_route'
    | 'governed_research_route'
    | 'invalid_configuration'
}>

function parseEnabled(value: string | undefined): boolean | null {
  if (value === undefined || value === '') return false
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

export function decideGovernedProductionRollout(
  input: Readonly<{
    routeContext: RouteExecutionContext
    configuredValue?: string
  }>
): GovernedProductionRolloutDecision {
  if (!input || typeof input !== 'object' || !input.routeContext) {
    return Object.freeze({
      enabled: false,
      useGovernedChain: false,
      reason: 'invalid_configuration' as const
    })
  }

  const enabled = parseEnabled(input.configuredValue)
  if (enabled === null) {
    return Object.freeze({
      enabled: false,
      useGovernedChain: false,
      reason: 'invalid_configuration' as const
    })
  }
  if (!enabled) {
    return Object.freeze({
      enabled: false,
      useGovernedChain: false,
      reason: 'disabled' as const
    })
  }
  if (!input.routeContext.routePlan.requiresResearch) {
    return Object.freeze({
      enabled: true,
      useGovernedChain: false,
      reason: 'non_research_route' as const
    })
  }
  return Object.freeze({
    enabled: true,
    useGovernedChain: true,
    reason: 'governed_research_route' as const
  })
}
