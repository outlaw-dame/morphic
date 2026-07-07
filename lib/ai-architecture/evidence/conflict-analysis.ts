import type { AtomicClaim } from './claim-extraction'
import type { EvidenceGraph } from './evidence-types'

export type EvidenceConflictSeverity = 'info' | 'warn' | 'block'

export type EvidenceConflictType =
  | 'negation_overlap'
  | 'numeric_mismatch'
  | 'status_mismatch'

export type EvidenceConflict = {
  id: string
  type: EvidenceConflictType
  severity: EvidenceConflictSeverity
  evidenceIds: string[]
  claimIds: string[]
  reason: string
}

const NEGATION_PATTERN = /\b(?:not|no|never|none|without|cannot|can't|won't|isn't|aren't|wasn't|weren't|doesn't|don't|didn't|hasn't|haven't|hadn't)\b/i
const NUMBER_PATTERN = /\b\d+(?:\.\d+)?%?\b/g

const STATUS_GROUPS = [
  {
    affirmative: ['approved', 'confirmed', 'verified', 'safe', 'valid'],
    negative: ['rejected', 'denied', 'disputed', 'unsafe', 'invalid']
  },
  {
    affirmative: ['increased', 'rose', 'rising', 'higher', 'growth'],
    negative: ['decreased', 'fell', 'falling', 'lower', 'decline']
  },
  {
    affirmative: ['legal', 'allowed', 'permitted'],
    negative: ['illegal', 'banned', 'prohibited']
  }
]

function stableId(parts: string[]): string {
  let hash = 5381
  const input = parts.join('|')
  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(hash, 33) ^ input.charCodeAt(index)
  }
  return `conflict_${(hash >>> 0).toString(36)}`
}

function words(value: string): Set<string> {
  return new Set(value.split(/\s+/).filter(Boolean))
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  let intersection = 0
  for (const word of left) {
    if (right.has(word)) intersection += 1
  }
  return intersection / (left.size + right.size - intersection)
}

function numbers(value: string): string[] {
  return value.match(NUMBER_PATTERN) ?? []
}

function hasAny(value: string, candidates: string[]): boolean {
  return candidates.some(candidate => value.includes(candidate))
}

function statusMismatch(left: string, right: string): boolean {
  return STATUS_GROUPS.some(group => {
    const leftAffirmative = hasAny(left, group.affirmative)
    const leftNegative = hasAny(left, group.negative)
    const rightAffirmative = hasAny(right, group.affirmative)
    const rightNegative = hasAny(right, group.negative)

    return (
      (leftAffirmative && rightNegative) ||
      (leftNegative && rightAffirmative)
    )
  })
}

function conflictReason(type: EvidenceConflictType): string {
  switch (type) {
    case 'negation_overlap':
      return 'Similar claims differ by explicit negation language.'
    case 'numeric_mismatch':
      return 'Similar claims contain different numeric values.'
    case 'status_mismatch':
      return 'Similar claims contain opposing status or outcome language.'
  }
}

function conflictSeverity(type: EvidenceConflictType): EvidenceConflictSeverity {
  return type === 'numeric_mismatch' ? 'warn' : 'block'
}

function createConflict(
  type: EvidenceConflictType,
  evidenceIds: string[],
  claimIds: string[]
): EvidenceConflict {
  const sortedEvidenceIds = [...new Set(evidenceIds)].sort()
  const sortedClaimIds = [...new Set(claimIds)].sort()

  return {
    id: stableId([type, ...sortedEvidenceIds, ...sortedClaimIds]),
    type,
    severity: conflictSeverity(type),
    evidenceIds: sortedEvidenceIds,
    claimIds: sortedClaimIds,
    reason: conflictReason(type)
  }
}

function detectPairConflict(
  left: AtomicClaim,
  right: AtomicClaim
): EvidenceConflictType | null {
  const leftWords = words(left.normalizedText)
  const rightWords = words(right.normalizedText)
  const similarity = jaccard(leftWords, rightWords)

  if (similarity < 0.5) return null

  const leftNegated = NEGATION_PATTERN.test(left.text)
  const rightNegated = NEGATION_PATTERN.test(right.text)
  if (leftNegated !== rightNegated) return 'negation_overlap'

  const leftNumbers = numbers(left.normalizedText)
  const rightNumbers = numbers(right.normalizedText)
  if (
    leftNumbers.length > 0 &&
    rightNumbers.length > 0 &&
    leftNumbers.join('|') !== rightNumbers.join('|')
  ) {
    return 'numeric_mismatch'
  }

  if (statusMismatch(left.normalizedText, right.normalizedText)) {
    return 'status_mismatch'
  }

  return null
}

export function analyzeEvidenceConflicts(
  graph: EvidenceGraph
): EvidenceConflict[] {
  const usableEvidenceIds = new Set(
    graph.items
      .filter(item => !item.duplicateOf && !item.copiedFrom)
      .map(item => item.id)
  )
  const claimEntries = Object.entries(graph.claimsByEvidenceId).flatMap(
    ([evidenceId, claims]) =>
      usableEvidenceIds.has(evidenceId)
        ? claims.map(claim => ({ evidenceId, claim }))
        : []
  )
  const conflicts = new Map<string, EvidenceConflict>()

  for (let leftIndex = 0; leftIndex < claimEntries.length; leftIndex += 1) {
    const left = claimEntries[leftIndex]
    if (!left) continue

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < claimEntries.length;
      rightIndex += 1
    ) {
      const right = claimEntries[rightIndex]
      if (!right || left.evidenceId === right.evidenceId) continue

      const conflictType = detectPairConflict(left.claim, right.claim)
      if (!conflictType) continue

      const conflict = createConflict(
        conflictType,
        [left.evidenceId, right.evidenceId],
        [left.claim.id, right.claim.id]
      )
      conflicts.set(conflict.id, conflict)
    }
  }

  return [...conflicts.values()].sort((left, right) =>
    left.id.localeCompare(right.id)
  )
}

export function conflictWarnings(conflicts: EvidenceConflict[]): string[] {
  return conflicts.map(conflict =>
    `conflict:${conflict.type}:${conflict.severity}:${conflict.evidenceIds.join(',')}`
  )
}
