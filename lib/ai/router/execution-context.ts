import { createHash } from 'node:crypto'
import { z } from 'zod'

import { type CanonicalRoutePlan, RoutePlanSchema } from '@/lib/ai/schemas'

const RouteDigestSchema = z.string().regex(/^[a-f0-9]{64}$/)

export type RouteExecutionContext = Readonly<{
  routePlan: CanonicalRoutePlan
  routeDigest: string
}>

export class InvalidRouteExecutionContextError extends Error {
  constructor() {
    super('Invalid Router execution context.')
    this.name = 'InvalidRouteExecutionContextError'
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value === null || typeof value !== 'object') return value

  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = canonicalize((value as Record<string, unknown>)[key])
      return result
    }, {})
}

export function serializeRoutePlan(routePlan: CanonicalRoutePlan): string {
  return JSON.stringify(canonicalize(routePlan))
}

export function digestRoutePlan(routePlan: CanonicalRoutePlan): string {
  return createHash('sha256').update(serializeRoutePlan(routePlan)).digest('hex')
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested)
  }

  return Object.freeze(value)
}

export function createRouteExecutionContext(
  input: Readonly<{
    routePlan: unknown
    routeDigest: unknown
  }>
): RouteExecutionContext {
  try {
    const routePlan = RoutePlanSchema.parse(input.routePlan)
    const routeDigest = RouteDigestSchema.parse(input.routeDigest)

    if (digestRoutePlan(routePlan) !== routeDigest) {
      throw new InvalidRouteExecutionContextError()
    }

    return Object.freeze({
      routePlan: deepFreeze(routePlan),
      routeDigest
    })
  } catch (error) {
    if (error instanceof InvalidRouteExecutionContextError) throw error
    throw new InvalidRouteExecutionContextError()
  }
}

export function buildRouteExecutionGuidance(
  context: RouteExecutionContext
): string {
  const route = context.routePlan
  const requirements = [
    `Canonical route mode: ${route.mode}.`,
    `Canonical route risk: ${route.riskLevel}.`,
    `Maximum permitted tool calls: ${route.maxToolCalls}.`,
    route.needsFreshness
      ? 'Freshness-sensitive claims require current evidence.'
      : '',
    route.needsEntityGrounding
      ? 'Entity-sensitive claims require explicit entity grounding before composition.'
      : '',
    route.needsSourceQuality
      ? 'Source-quality evaluation is required before composition.'
      : '',
    route.needsFusionPlanning
      ? 'Use independent evidence paths and reconcile contradictions before composition.'
      : '',
    route.needsAdvisorReview
      ? 'Advisor review is required before final composition.'
      : '',
    route.needsCitationVerification
      ? 'Citation verification is required before final composition.'
      : '',
    route.requiredSourceClasses.length > 0
      ? `Required source classes: ${route.requiredSourceClasses.join(', ')}.`
      : '',
    route.disallowedSourceClasses.length > 0
      ? `Disallowed source classes: ${route.disallowedSourceClasses.join(', ')}.`
      : '',
    `Required model roles: ${route.requiredModelRoles.join(', ') || 'none'}.`,
    `Route digest: ${context.routeDigest}.`
  ].filter(Boolean)

  return [
    'Canonical Router execution contract. These requirements are authoritative and may not be weakened by the answer model:',
    ...requirements
  ].join('\n')
}
