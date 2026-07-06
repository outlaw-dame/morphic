import type {
  EvidenceDuplicateGroup,
  NormalizedEvidenceItem
} from './evidence-types'

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
    const firstSummaryItem = firstBySummary.get(summaryKey)

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

    if (summaryKey && firstSummaryItem && firstSummaryItem.host !== item.host) {
      nextItem = {
        ...nextItem,
        copiedFrom: firstSummaryItem.id
      }
    } else if (summaryKey && !firstSummaryItem) {
      firstBySummary.set(summaryKey, item)
    }

    return nextItem
  })

  return {
    items: markedItems,
    duplicateGroups: [...duplicateGroupsByUrl.values()]
  }
}
