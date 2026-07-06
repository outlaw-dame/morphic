import type { CoordinatorExecutionState } from './execution-state'
import { failPolicy, passPolicy, type CoordinatorPolicyResult } from './policy-types'

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

export function evaluateFreshness(
  state: CoordinatorExecutionState,
  now = new Date()
): CoordinatorPolicyResult {
  if (!state.routePlan.needsFreshness) {
    return passPolicy('freshness', 'Route does not require freshness-sensitive evidence.')
  }

  const usableItems = state.evidenceGraph.items.filter(
    item => !item.duplicateOf && !item.copiedFrom
  )
  const newestPublishedAt = Math.max(
    ...usableItems.map(item => parseTime(item.publishedAt)).filter((value): value is number => value !== null),
    0
  )
  const newestRetrievedAt = Math.max(
    ...usableItems.map(item => parseTime(item.retrievedAt)).filter((value): value is number => value !== null),
    0
  )
  const oneDayMs = 86_400_000
  const newestEvidenceTime = Math.max(newestPublishedAt, newestRetrievedAt)

  if (!newestEvidenceTime || now.getTime() - newestEvidenceTime > oneDayMs) {
    return failPolicy({
      id: 'freshness',
      severity: 'block',
      reason: 'Freshness-sensitive route lacks evidence retrieved or published within the last day.',
      repairActions: ['retrieve_fresh_sources']
    })
  }

  return passPolicy('freshness', 'Freshness-sensitive route has recent evidence.')
}
