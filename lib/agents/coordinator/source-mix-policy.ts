import type { SourceClass } from '@/lib/ai/schemas'

import type { CoordinatorExecutionState } from './execution-state'
import { failPolicy, passPolicy, type CoordinatorPolicyResult } from './policy-types'

const WEAK_SOURCE_CLASSES = new Set<SourceClass>([
  'forum_or_reddit',
  'social_media',
  'content_farm',
  'scraper_or_aggregator',
  'unknown'
])

function uniqueHosts(state: CoordinatorExecutionState): Set<string> {
  return new Set(
    state.evidenceGraph.items
      .filter(item => !item.duplicateOf && !item.copiedFrom)
      .map(item => item.host)
  )
}

export function evaluateSourceMix(
  state: CoordinatorExecutionState
): CoordinatorPolicyResult {
  const usableItems = state.evidenceGraph.items.filter(
    item => !item.duplicateOf && !item.copiedFrom
  )
  if (usableItems.length === 0) {
    return failPolicy({
      id: 'source_mix',
      severity: 'block',
      reason: 'No usable evidence remains after duplicate and copied-source filtering.',
      repairActions: ['retrieve_more_sources']
    })
  }

  const requiredClasses = state.routePlan.requiredSourceClasses
  const missingRequiredClasses = requiredClasses.filter(
    sourceClass => !usableItems.some(item => item.sourceClass === sourceClass)
  )
  if (missingRequiredClasses.length > 0) {
    return failPolicy({
      id: 'source_mix',
      severity: 'block',
      reason: `Missing required source classes: ${missingRequiredClasses.join(', ')}.`,
      repairActions: ['retrieve_required_source_classes']
    })
  }

  const hosts = uniqueHosts(state)
  const onlyWeakSources = usableItems.every(item =>
    WEAK_SOURCE_CLASSES.has(item.sourceClass)
  )
  if ((state.routePlan.riskLevel === 'high' || state.routePlan.mode === 'critical') && onlyWeakSources) {
    return failPolicy({
      id: 'source_mix',
      severity: 'block',
      reason: 'High-risk or critical routes cannot proceed using only weak/community sources.',
      repairActions: ['retrieve_authoritative_sources', 'escalate_to_advisor']
    })
  }

  if (hosts.size < 2 && state.routePlan.mode !== 'quick') {
    return failPolicy({
      id: 'source_mix',
      severity: 'warn',
      reason: 'Adaptive or critical routes should use at least two independent hosts.',
      repairActions: ['retrieve_independent_sources']
    })
  }

  return passPolicy('source_mix', 'Source mix is adequate for the current route.')
}
