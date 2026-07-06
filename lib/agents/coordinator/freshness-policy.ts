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

function newestTime(
  items: CoordinatorExecutionState['evidenceGraph']['items'],
  field: 'publishedAt' | 'retrievedAt'
): number {
  return items.reduce((max, item) => {
    const time = parseTime(item[field])
    return time !== null && time > max ? time : max
  }, 0)
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
  const newestPublishedAt = newestTime(usableItems, 'publishedAt')
  const newestRetrievedAt = newestTime(usableItems, 'retrievedAt')
  const oneDayMs = 86_400_000
  const newestEvidenceTime =
    newestPublishedAt > newestRetrievedAt ? newestPublishedAt : newestRetrievedAt

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
