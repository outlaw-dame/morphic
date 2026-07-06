import type { CoordinatorExecutionState } from './execution-state'
import {
  type CoordinatorPolicyResult,
  failPolicy,
  passPolicy
} from './policy-types'

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

function parseTimes(values: Array<string | null | undefined>): number[] {
  return values
    .map(value => parseTime(value))
    .filter((value): value is number => value !== null)
}

export function evaluateFreshness(
  state: CoordinatorExecutionState,
  now = new Date()
): CoordinatorPolicyResult {
  if (!state.routePlan.needsFreshness) {
    return passPolicy(
      'freshness',
      'Route does not require freshness-sensitive evidence.'
    )
  }

  const usableItems = state.evidenceGraph.items.filter(
    item => !item.duplicateOf && !item.copiedFrom
  )
  const newestPublishedAt = Math.max(
    ...parseTimes(usableItems.map(item => item.publishedAt)),
    0
  )
  const newestRetrievedAt = Math.max(
    ...parseTimes(usableItems.map(item => item.retrievedAt)),
    0
  )
  const oneDayMs = 86_400_000
  const newestEvidenceTime = Math.max(newestPublishedAt, newestRetrievedAt)

  if (!newestEvidenceTime || now.getTime() - newestEvidenceTime > oneDayMs) {
    return failPolicy({
      id: 'freshness',
      severity: 'block',
      reason:
        'Freshness-sensitive route lacks evidence retrieved or published within the last day.',
      repairActions: ['retrieve_fresh_sources']
    })
  }

  return passPolicy('freshness', 'Freshness-sensitive route has recent evidence.')
}
