import { describe, expect, it } from 'vitest'

import { analyzeEvidenceConflicts, conflictWarnings } from './conflict-analysis'
import type {
  EvidenceGraph,
  NormalizedEvidenceItem
} from './evidence-types'

const retrievedAt = '2026-07-05T12:00:00.000Z'

function evidenceItem(
  overrides: Partial<NormalizedEvidenceItem> = {}
): NormalizedEvidenceItem {
  return {
    id: 'ev_one',
    url: 'https://example.com/report',
    title: 'Example report',
    sourceClass: 'established_news',
    evidenceRole: 'original_reporting',
    claimIds: ['cl_one'],
    quotedText: null,
    summary: 'The product is approved for adults in the United States.',
    retrievalPath: 'search',
    publishedAt: retrievedAt,
    retrievedAt,
    confidence: 0.72,
    canonicalUrl: 'https://example.com/report',
    host: 'example.com',
    originalUrl: 'https://example.com/report',
    sourceQuality: {
      sourceClass: 'established_news',
      evidenceRole: 'original_reporting',
      sourceClassScore: 0.76,
      topicalAuthorityScore: 0.74,
      transparencyScore: 0.5,
      originalityScore: 0.62,
      freshnessScore: 0.88,
      corroborationScore: 0.45,
      conflictOfInterestPenalty: 0,
      spamOrContentFarmPenalty: 0,
      userPreferenceModifier: 0,
      finalWeight: 0.72,
      influenceCap: 0.78,
      requiresCorroboration: false,
      allowedClaimTypes: [],
      disallowedClaimTypes: []
    },
    entities: [],
    ...overrides
  }
}

function graph(overrides: Partial<EvidenceGraph> = {}): EvidenceGraph {
  const items = overrides.items ?? [evidenceItem()]

  return {
    items,
    duplicateGroups: [],
    claimClusters: [],
    conflicts: [],
    claimsByEvidenceId: {},
    warnings: [],
    ...overrides
  }
}

describe('analyzeEvidenceConflicts', () => {
  it('detects negation conflicts across independent usable evidence', () => {
    const conflicts = analyzeEvidenceConflicts(
      graph({
        items: [
          evidenceItem({ id: 'ev_one', host: 'example.com' }),
          evidenceItem({
            id: 'ev_two',
            url: 'https://other.example.net/report',
            canonicalUrl: 'https://other.example.net/report',
            host: 'other.example.net'
          })
        ],
        claimsByEvidenceId: {
          ev_one: [
            {
              id: 'cl_affirmed',
              text: 'The product is approved for adults in the United States.',
              normalizedText: 'product approved adults united states'
            }
          ],
          ev_two: [
            {
              id: 'cl_negated',
              text: 'The product is not approved for adults in the United States.',
              normalizedText: 'product approved adults united states'
            }
          ]
        }
      })
    )

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({
      type: 'negation_overlap',
      severity: 'block',
      evidenceIds: ['ev_one', 'ev_two']
    })
  })

  it('detects numeric mismatches without blocking by default', () => {
    const conflicts = analyzeEvidenceConflicts(
      graph({
        items: [
          evidenceItem({ id: 'ev_one', host: 'example.com' }),
          evidenceItem({
            id: 'ev_two',
            url: 'https://other.example.net/report',
            canonicalUrl: 'https://other.example.net/report',
            host: 'other.example.net'
          })
        ],
        claimsByEvidenceId: {
          ev_one: [
            {
              id: 'cl_42',
              text: 'The reported rate increased to 42 percent in 2026.',
              normalizedText: 'reported rate increased 42 percent 2026'
            }
          ],
          ev_two: [
            {
              id: 'cl_47',
              text: 'The reported rate increased to 47 percent in 2026.',
              normalizedText: 'reported rate increased 47 percent 2026'
            }
          ]
        }
      })
    )

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({
      type: 'numeric_mismatch',
      severity: 'warn'
    })
  })

  it('ignores copied or duplicate evidence when analyzing conflicts', () => {
    const conflicts = analyzeEvidenceConflicts(
      graph({
        items: [
          evidenceItem({ id: 'ev_one', host: 'example.com' }),
          evidenceItem({
            id: 'ev_two',
            url: 'https://copy.example.net/report',
            canonicalUrl: 'https://copy.example.net/report',
            host: 'copy.example.net',
            copiedFrom: 'ev_one'
          })
        ],
        claimsByEvidenceId: {
          ev_one: [
            {
              id: 'cl_affirmed',
              text: 'The product is approved for adults in the United States.',
              normalizedText: 'product approved adults united states'
            }
          ],
          ev_two: [
            {
              id: 'cl_negated',
              text: 'The product is not approved for adults in the United States.',
              normalizedText: 'product approved adults united states'
            }
          ]
        }
      })
    )

    expect(conflicts).toEqual([])
  })

  it('formats conflict warnings for coordinator contradiction policy', () => {
    const warnings = conflictWarnings([
      {
        id: 'conflict_one',
        type: 'status_mismatch',
        severity: 'block',
        evidenceIds: ['ev_one', 'ev_two'],
        claimIds: ['cl_one', 'cl_two'],
        reason: 'Similar claims contain opposing status or outcome language.'
      }
    ])

    expect(warnings).toEqual(['conflict:status_mismatch:block:ev_one,ev_two'])
  })
})
