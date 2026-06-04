import type { RoutingDecision } from './types'

const FRESHNESS_PATTERNS =
  /\b(latest|current|recent|today|yesterday|tomorrow|new|updated|202[5-9]|now)\b/i
const PRIVATE_CONTEXT_PATTERNS =
  /\b(my|saved|private|local|feeds?|podcast transcripts?|memory|profile|subscriptions?)\b/i
const SECURITY_PATTERNS =
  /\b(security|secure|ssrf|xss|csrf|injection|bypass|threat|vulnerab|exploit|adversarial|hardening)\b/i
const CODE_PATTERNS =
  /\b(code|repo|repository|tests?|implementation|bug|fix|typecheck|ci)\b/i
const CREATIVE_PATTERNS = /\b(write a poem|story|creative|brainstorm)\b/i

export function classifyOperationRequest(input: string): RoutingDecision {
  const text = input.trim()
  const lower = text.toLowerCase()
  const asksQuestion =
    /[?]$/.test(text) ||
    /\b(what|why|how|compare|search|find|explain|review)\b/i.test(text)
  const hasUrl = /https?:\/\/\S+/i.test(text)
  const requiresFreshness = FRESHNESS_PATTERNS.test(text)
  const privateAllowed = PRIVATE_CONTEXT_PATTERNS.test(text)
  const securityWork = SECURITY_PATTERNS.test(text)
  const codeWork = CODE_PATTERNS.test(text)

  if (securityWork) {
    return {
      taskType: 'security_review',
      privacyLevel: privateAllowed ? 'private_allowed' : 'external_allowed',
      difficulty: 'high',
      latencyBudgetMs: 45_000,
      costBudgetCents: 8,
      requiresTools: true,
      requiresFreshness,
      requiresCitations: true,
      requiresDeterminism: true,
      escalationPolicy: 'always_frontier'
    }
  }

  if (codeWork) {
    return {
      taskType: 'code',
      privacyLevel: privateAllowed ? 'private_allowed' : 'external_allowed',
      difficulty: 'high',
      latencyBudgetMs: 45_000,
      costBudgetCents: 6,
      requiresTools: true,
      requiresFreshness,
      requiresCitations: true,
      requiresDeterminism: true,
      escalationPolicy: 'on_low_confidence'
    }
  }

  if (CREATIVE_PATTERNS.test(lower) && !asksQuestion) {
    return {
      taskType: 'creative',
      privacyLevel: privateAllowed ? 'private_allowed' : 'external_allowed',
      difficulty: 'low',
      latencyBudgetMs: 8_000,
      costBudgetCents: 1,
      requiresTools: false,
      requiresFreshness: false,
      requiresCitations: false,
      requiresDeterminism: false,
      escalationPolicy: 'never'
    }
  }

  return {
    taskType: asksQuestion || hasUrl ? 'research' : 'simple_answer',
    privacyLevel: privateAllowed ? 'private_allowed' : 'external_allowed',
    difficulty: requiresFreshness ? 'medium' : 'low',
    latencyBudgetMs: requiresFreshness ? 20_000 : 12_000,
    costBudgetCents: requiresFreshness ? 2 : 1,
    requiresTools: asksQuestion || hasUrl || requiresFreshness,
    requiresFreshness,
    requiresCitations: asksQuestion || requiresFreshness,
    requiresDeterminism: false,
    escalationPolicy: requiresFreshness ? 'on_low_confidence' : 'never'
  }
}
