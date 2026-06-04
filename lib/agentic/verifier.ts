import type {
  MorphicEvidenceItem,
  MorphicVerificationIssue,
  MorphicVerificationReport,
  RoutingDecision
} from './types'

const DEFAULT_MAX_FRESHNESS_AGE_MS = 24 * 60 * 60 * 1000

export function verifyEvidenceSet(
  evidence: MorphicEvidenceItem[],
  decision: RoutingDecision,
  options: {
    now?: string
    maxFreshnessAgeMs?: number
  } = {}
): MorphicVerificationReport {
  const issues: MorphicVerificationIssue[] = []
  const primarySourceCount = evidence.filter(
    item => item.qualityTier === 'primary'
  ).length

  if (decision.requiresCitations && evidence.length === 0) {
    issues.push({
      code: 'missing_evidence',
      severity: 'high',
      message:
        'This operation requires citations but no evidence was collected.'
    })
  }

  if (
    decision.requiresCitations &&
    evidence.some(item => item.citationRef === undefined)
  ) {
    issues.push({
      code: 'missing_citations',
      severity: 'high',
      message: 'One or more evidence items are missing citation references.'
    })
  }

  if (decision.requiresFreshness && evidence.length > 0) {
    const now = new Date(options.now ?? new Date().toISOString()).getTime()
    const maxAge = options.maxFreshnessAgeMs ?? DEFAULT_MAX_FRESHNESS_AGE_MS
    const hasStaleEvidence = evidence.some(item => {
      const retrievedAt = new Date(item.retrievedAt).getTime()
      return Number.isFinite(retrievedAt) && now - retrievedAt > maxAge
    })

    if (hasStaleEvidence) {
      issues.push({
        code: 'stale_evidence',
        severity: 'medium',
        message:
          'Freshness-sensitive work includes evidence outside the freshness budget.'
      })
    }
  }

  if (
    decision.difficulty === 'high' &&
    evidence.length > 0 &&
    primarySourceCount === 0
  ) {
    issues.push({
      code: 'no_primary_sources',
      severity: 'medium',
      message:
        'High-difficulty work should include at least one primary or official source.'
    })
  }

  const highIssues = issues.filter(issue => issue.severity === 'high').length
  const mediumIssues = issues.filter(
    issue => issue.severity === 'medium'
  ).length
  const status =
    highIssues > 0
      ? 'insufficient'
      : mediumIssues > 0
        ? 'needs_review'
        : 'supported'
  const confidence =
    status === 'supported' && primarySourceCount > 0
      ? 'high'
      : status === 'supported'
        ? 'medium'
        : 'low'

  return {
    status,
    confidence,
    evidenceCount: evidence.length,
    primarySourceCount,
    issues
  }
}
