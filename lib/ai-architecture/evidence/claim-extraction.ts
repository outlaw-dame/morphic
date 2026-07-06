const MAX_CLAIMS_PER_ITEM = 5
const MIN_CLAIM_LENGTH = 24
const MAX_CLAIM_LENGTH = 280

export type AtomicClaim = {
  id: string
  text: string
  normalizedText: string
}

export function normalizeClaimText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function claimHash(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash, 33) ^ value.charCodeAt(index)
  }
  return `cl_${(hash >>> 0).toString(36)}`
}

function normalizeForCluster(value: string): string {
  return normalizeClaimText(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(
      /\b(the|a|an|and|or|but|of|to|in|on|for|with|by|from)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractAtomicClaims(
  text: string,
  maxClaims = MAX_CLAIMS_PER_ITEM
): AtomicClaim[] {
  const normalized = normalizeClaimText(text)
  if (!normalized) return []

  const seen = new Set<string>()
  const claims: AtomicClaim[] = []
  const sentences = normalized.split(/(?<=[.!?])\s+/)

  for (const sentence of sentences) {
    const clean = normalizeClaimText(sentence).slice(0, MAX_CLAIM_LENGTH)
    if (clean.length < MIN_CLAIM_LENGTH) continue

    const normalizedText = normalizeForCluster(clean)
    if (!normalizedText || seen.has(normalizedText)) continue

    seen.add(normalizedText)
    claims.push({
      id: claimHash(normalizedText),
      text: clean,
      normalizedText
    })

    if (claims.length >= maxClaims) break
  }

  return claims
}

export type ClaimCluster = {
  id: string
  normalizedText: string
  claimIds: string[]
  evidenceIds: string[]
  independentHostCount: number
}

export function clusterClaims(
  claimsByEvidenceId: Map<string, AtomicClaim[]>,
  hostByEvidenceId: Map<string, string>
): ClaimCluster[] {
  const clusters = new Map<string, ClaimCluster>()

  for (const [evidenceId, claims] of claimsByEvidenceId.entries()) {
    for (const claim of claims) {
      const existing = clusters.get(claim.normalizedText) ?? {
        id: claim.id,
        normalizedText: claim.normalizedText,
        claimIds: [],
        evidenceIds: [],
        independentHostCount: 0
      }

      if (!existing.claimIds.includes(claim.id)) {
        existing.claimIds.push(claim.id)
      }
      if (!existing.evidenceIds.includes(evidenceId)) {
        existing.evidenceIds.push(evidenceId)
      }

      clusters.set(claim.normalizedText, existing)
    }
  }

  return [...clusters.values()].map(cluster => {
    const hosts = new Set(
      cluster.evidenceIds
        .map(evidenceId => hostByEvidenceId.get(evidenceId))
        .filter((host): host is string => Boolean(host))
    )

    return {
      ...cluster,
      independentHostCount: hosts.size
    }
  })
}
