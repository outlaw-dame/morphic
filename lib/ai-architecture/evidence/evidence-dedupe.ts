import type {
  EvidenceDuplicateGroup,
  NormalizedEvidenceItem
} from './evidence-types'

const MIN_COPIED_SUMMARY_KEY_LENGTH = 50

function normalizeSummary(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function markDuplicateEvidence(items: NormalizedEvidenceItem[]): {
  items: NormalizedEvidenceItem[]
  duplicateGroups: EvidenceDuplicateGroup[]
} {
  const firstByCanonicalUrl = new Map<string, string>()
  const duplicateGroupsByUrl = new Map<string, EvidenceDuplicateGroup>()
  const firstBySummary = new Map<string, NormalizedEvidenceItem>()

  const markedItems = items.map(item => {
    const representativeId = firstByCanonicalUrl.get(item.canonicalUrl)
    const summaryKey = normalizeSummary(item.summary)
    const isSubstantialSummary = summaryKey.length >= MIN_COPIED_SUMMARY_KEY_LENGTH
    const firstSummaryItem = isSubstantialSummary
      ? firstBySummary.get(summaryKey)
      : undefined

    let nextItem = item

    if (representativeId) {
      nextItem = {
        ...nextItem,
        duplicateOf: representativeId
      }
      const group = duplicateGroupsByUrl.get(item.canonicalUrl) ?? {
        canonicalUrl: item.canonicalUrl,
        representativeId,
        evidenceIds: [representativeId]
      }
      if (!group.evidenceIds.includes(item.id)) {
        group.evidenceIds.push(item.id)
      }
      duplicateGroupsByUrl.set(item.canonicalUrl, group)
    } else {
      firstByCanonicalUrl.set(item.canonicalUrl, item.id)
    }

    if (isSubstantialSummary && firstSummaryItem && firstSummaryItem.host !== item.host) {
      nextItem = {
        ...nextItem,
        copiedFrom: firstSummaryItem.id
      }
    } else if (isSubstantialSummary && !firstSummaryItem) {
      firstBySummary.set(summaryKey, item)
    }

    return nextItem
  })

  return {
    items: markedItems,
    duplicateGroups: [...duplicateGroupsByUrl.values()]
  }
}
