import type { RoutePlan } from '@/lib/ai/schemas'

import type { CoordinatorAdmissionConflictRepairHint } from './admission'

export type CoordinatorRepairStepSource = 'policy_action' | 'conflict_hint'
export type CoordinatorRepairStepPriority = 'high' | 'medium' | 'low'

export type CoordinatorRepairStep = {
  id: string
  action: string
  source: CoordinatorRepairStepSource
  priority: CoordinatorRepairStepPriority
  reason: string
  evidenceIds: string[]
  claimIds: string[]
  originalAction?: string
}

export type CoordinatorSkippedRepairAction = {
  action: string
  reason:
    | 'duplicate_action'
    | 'retrieval_attempt_budget_exhausted'
    | 'unsupported_repair_action'
    | 'max_steps_reached'
  source: CoordinatorRepairStepSource
}

export type CoordinatorBoundedRepairPlanInput = {
  routePlan: RoutePlan
  requiredRepairActions: string[]
  conflictRepairHints: CoordinatorAdmissionConflictRepairHint[]
  retrievalAttempts?: number
  maxRetrievalAttempts?: number
  maxSteps?: number
}

export type CoordinatorBoundedRepairPlan = {
  canAttemptRepair: boolean
  remainingRetrievalAttempts: number
  steps: CoordinatorRepairStep[]
  skippedActions: CoordinatorSkippedRepairAction[]
  blockedReasons: string[]
}

type RepairCandidate = {
  action: string
  source: CoordinatorRepairStepSource
  priority: CoordinatorRepairStepPriority
  reason: string
  evidenceIds: string[]
  claimIds: string[]
}

const DEFAULT_MAX_RETRIEVAL_ATTEMPTS = 2
const DEFAULT_MAX_STEPS = 5

const SUPPORTED_REPAIR_ACTIONS = new Set([
  'retrieve_authoritative_sources',
  'retrieve_current_status_source',
  'retrieve_disambiguating_sources',
  'retrieve_fresh_sources',
  'retrieve_independent_corroboration',
  'retrieve_independent_sources',
  'retrieve_more_sources',
  'retrieve_primary_numeric_source',
  'retrieve_required_source_classes',
  'run_advisor_review',
  'run_citation_verifier',
  'run_contradiction_review',
  'run_entity_grounding',
  'select_stronger_model'
])

const RETRIEVAL_ACTIONS = new Set([
  'retrieve_authoritative_sources',
  'retrieve_current_status_source',
  'retrieve_disambiguating_sources',
  'retrieve_fresh_sources',
  'retrieve_independent_corroboration',
  'retrieve_independent_sources',
  'retrieve_more_sources',
  'retrieve_primary_numeric_source',
  'retrieve_required_source_classes'
])

const BROAD_HIGH_RISK_RETRIEVAL_REPLACEMENTS = new Map([
  ['retrieve_more_sources', 'retrieve_authoritative_sources'],
  ['retrieve_independent_sources', 'retrieve_independent_corroboration']
])

function isHighAssuranceRoute(routePlan: RoutePlan): boolean {
  return routePlan.riskLevel === 'high' || routePlan.riskLevel === 'critical'
}

function normalizeRepairAction(action: string, routePlan: RoutePlan): string {
  if (!isHighAssuranceRoute(routePlan)) return action
  return BROAD_HIGH_RISK_RETRIEVAL_REPLACEMENTS.get(action) ?? action
}

function isRetrievalAction(action: string): boolean {
  return RETRIEVAL_ACTIONS.has(action)
}

function priorityRank(priority: CoordinatorRepairStepPriority): number {
  if (priority === 'high') return 0
  if (priority === 'medium') return 1
  return 2
}

function safeAction(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function safeStringArray(value: string[]): string[] {
  return [...new Set(value.filter(item => typeof item === 'string'))]
}

function policyActionReason(action: string): string {
  if (action === 'retrieve_authoritative_sources') {
    return 'Retrieve authoritative sources before composition.'
  }
  if (action === 'retrieve_required_source_classes') {
    return 'Retrieve the source classes required by the route plan.'
  }
  if (action === 'retrieve_fresh_sources') {
    return 'Retrieve fresh sources for the freshness-sensitive route.'
  }
  if (action === 'retrieve_disambiguating_sources') {
    return 'Retrieve sources that disambiguate ambiguous grounded entities.'
  }
  if (action === 'run_entity_grounding') {
    return 'Run entity grounding before composition.'
  }
  if (action === 'run_contradiction_review') {
    return 'Review contradictory evidence before composition.'
  }
  if (action === 'run_advisor_review') {
    return 'Escalate to advisor review before composition.'
  }
  if (action === 'run_citation_verifier') {
    return 'Verify citations before final composition.'
  }
  if (action === 'select_stronger_model') {
    return 'Select a stronger model for the remaining reasoning step.'
  }
  if (action === 'retrieve_independent_sources') {
    return 'Retrieve independent sources to improve source diversity.'
  }
  if (action === 'retrieve_more_sources') {
    return 'Retrieve more sources before composition.'
  }
  return 'Run the requested deterministic repair action.'
}

function policyActionPriority(action: string): CoordinatorRepairStepPriority {
  if (
    action === 'run_advisor_review' ||
    action === 'select_stronger_model' ||
    action === 'retrieve_authoritative_sources' ||
    action === 'run_contradiction_review'
  ) {
    return 'high'
  }
  if (action === 'run_citation_verifier' || action === 'run_entity_grounding') {
    return 'medium'
  }
  return 'low'
}

function hintCandidates(
  hints: CoordinatorAdmissionConflictRepairHint[]
): RepairCandidate[] {
  return hints.map(hint => ({
    action: hint.action,
    source: 'conflict_hint',
    priority: hint.priority,
    reason: hint.reason,
    evidenceIds: safeStringArray(hint.evidenceIds),
    claimIds: safeStringArray(hint.claimIds)
  }))
}

function policyCandidates(actions: string[]): RepairCandidate[] {
  return actions.flatMap(action => {
    const safe = safeAction(action)
    if (!safe) return []
    return [
      {
        action: safe,
        source: 'policy_action' as const,
        priority: policyActionPriority(safe),
        reason: policyActionReason(safe),
        evidenceIds: [],
        claimIds: []
      }
    ]
  })
}

function boundedNonNegativeInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.floor(value ?? fallback))
}

export function createBoundedRepairPlan(
  input: CoordinatorBoundedRepairPlanInput
): CoordinatorBoundedRepairPlan {
  const retrievalAttempts = boundedNonNegativeInteger(input.retrievalAttempts, 0)
  const maxRetrievalAttempts = boundedNonNegativeInteger(
    input.maxRetrievalAttempts,
    DEFAULT_MAX_RETRIEVAL_ATTEMPTS
  )
  const maxSteps = boundedNonNegativeInteger(input.maxSteps, DEFAULT_MAX_STEPS)
  const remainingRetrievalAttempts = Math.max(
    0,
    maxRetrievalAttempts - retrievalAttempts
  )
  const candidates = [
    ...hintCandidates(input.conflictRepairHints),
    ...policyCandidates(input.requiredRepairActions)
  ].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))

  const seenActions = new Set<string>()
  const steps: CoordinatorRepairStep[] = []
  const skippedActions: CoordinatorSkippedRepairAction[] = []

  for (const candidate of candidates) {
    const normalizedAction = normalizeRepairAction(candidate.action, input.routePlan)

    if (!SUPPORTED_REPAIR_ACTIONS.has(normalizedAction)) {
      skippedActions.push({
        action: candidate.action,
        reason: 'unsupported_repair_action',
        source: candidate.source
      })
      continue
    }

    if (seenActions.has(normalizedAction)) {
      skippedActions.push({
        action: normalizedAction,
        reason: 'duplicate_action',
        source: candidate.source
      })
      continue
    }

    if (isRetrievalAction(normalizedAction) && remainingRetrievalAttempts <= 0) {
      skippedActions.push({
        action: normalizedAction,
        reason: 'retrieval_attempt_budget_exhausted',
        source: candidate.source
      })
      continue
    }

    if (steps.length >= maxSteps) {
      skippedActions.push({
        action: normalizedAction,
        reason: 'max_steps_reached',
        source: candidate.source
      })
      continue
    }

    seenActions.add(normalizedAction)
    steps.push({
      id: `repair_step_${steps.length + 1}:${normalizedAction}`,
      action: normalizedAction,
      source: candidate.source,
      priority: candidate.priority,
      reason: candidate.reason,
      evidenceIds: candidate.evidenceIds,
      claimIds: candidate.claimIds,
      ...(normalizedAction !== candidate.action
        ? { originalAction: candidate.action }
        : {})
    })
  }

  return {
    canAttemptRepair: steps.length > 0,
    remainingRetrievalAttempts,
    steps,
    skippedActions,
    blockedReasons:
      steps.length > 0 ? [] : ['no_supported_repair_steps_available']
  }
}
