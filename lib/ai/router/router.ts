import type { Model } from '@/lib/types/models'

import {
  RoutePlanSchema,
  type ModelRole,
  type ResearchMode,
  type RiskLevel,
  type RoutePlan,
  type SourceClass
} from '@/lib/ai/schemas'
import { getRolePrompt } from '@/lib/ai/prompts'
import { selectModelForRole } from '@/lib/models/role-selection'

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

const CURRENT_OR_FRESH_PATTERNS = [
  /\b(today|tonight|current|currently|latest|recent|now|breaking)\b/i,
  /\b(price|prices|schedule|score|weather|forecast|release date)\b/i,
  /\b202[6-9]\b/i
]

const HIGH_RISK_PATTERNS = [
  /\b(legal|lawyer|lawsuit|settlement|insurance|court|contract)\b/i,
  /\b(medical|doctor|diagnosis|treatment|symptom|concussion)\b/i,
  /\b(financial|investment|tax|loan|mortgage|bankruptcy)\b/i,
  /\b(election|voting|ballot|president|senator|governor)\b/i
]

const ENTITY_GROUNDING_PATTERNS = [
  /\b(company|ceo|president|founder|author|paper|repo|repository)\b/i,
  /\bwho is\b/i,
  /\bwhat is\b/i,
  /\bcompare\b/i
]

const OFFICIAL_SOURCE_PATTERNS = [
  /\b(law|regulation|policy|official|government|court|filing)\b/i,
  /\b(api|docs|documentation|spec|standard)\b/i
]

function includesAny(query: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(query))
}

function inferRiskLevel(query: string): RiskLevel {
  return includesAny(query, HIGH_RISK_PATTERNS) ? 'high' : 'low'
}

function inferMode(query: string, requestedMode?: ResearchMode): ResearchMode {
  if (requestedMode) return requestedMode
  if (includesAny(query, HIGH_RISK_PATTERNS)) return 'critical'
  if (includesAny(query, CURRENT_OR_FRESH_PATTERNS)) return 'adaptive'
  return 'quick'
}

function inferRequiredSourceClasses(query: string): SourceClass[] {
  if (includesAny(query, OFFICIAL_SOURCE_PATTERNS)) {
    return ['official_source']
  }

  return []
}

function inferRequiredModelRoles(routePlan: Omit<RoutePlan, 'requiredModelRoles'>): ModelRole[] {
  const roles: ModelRole[] = ['router', 'retriever', 'answer_composer']

  if (routePlan.needsEntityGrounding) {
    roles.push('entity_grounding')
  }

  if (routePlan.needsAdvisorReview) {
    roles.push('advisor')
  }

  if (routePlan.needsCitationVerification) {
    roles.push('citation_verifier')
  }

  return roles
}

export function routeResearchRequest(input: RouterInput): RouterResult {
  const query = input.query.trim()
  const prompt = getRolePrompt('router')
  const riskLevel = inferRiskLevel(query)
  const mode = inferMode(query, input.requestedMode)
  const needsFreshness = includesAny(query, CURRENT_OR_FRESH_PATTERNS)
  const needsEntityGrounding = includesAny(query, ENTITY_GROUNDING_PATTERNS)
  const needsAdvisorReview = riskLevel === 'high' || mode === 'critical'

  const routePlanWithoutRoles = {
    mode,
    riskLevel,
    requiredSourceClasses: inferRequiredSourceClasses(query),
    needsFreshness,
    needsEntityGrounding,
    needsAdvisorReview,
    needsCitationVerification: true,
    maxToolCalls: mode === 'critical' ? 50 : mode === 'adaptive' ? 35 : 20,
    rationale: `Deterministic router classified the request as ${mode} with ${riskLevel} risk.`
  } satisfies Omit<RoutePlan, 'requiredModelRoles'>

  const routePlan = RoutePlanSchema.parse({
    ...routePlanWithoutRoles,
    requiredModelRoles: inferRequiredModelRoles(routePlanWithoutRoles)
  })

  const roleSelection = selectModelForRole(input.availableModels ?? [], 'router')

  return {
    routePlan,
    promptVersion: prompt.version,
    selectedModelId: roleSelection.selected?.model.id ?? null,
    rejectedModelCount: roleSelection.rejected.length
  }
}
