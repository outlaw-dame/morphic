import { describe, expect, it } from 'vitest'

import { conflictWarnings } from './conflict-analysis'

describe('conflictWarnings', () => {
  it('deduplicates repeated warning strings', () => {
    expect(
      conflictWarnings([
        {
          id: 'first',
          type: 'status_mismatch',
          severity: 'block',
          evidenceIds: ['ev_one', 'ev_two'],
          claimIds: ['a', 'b'],
          reason: 'Similar claims contain opposing status or outcome language.'
        },
        {
          id: 'second',
          type: 'status_mismatch',
          severity: 'block',
          evidenceIds: ['ev_one', 'ev_two'],
          claimIds: ['c', 'd'],
          reason: 'Similar claims contain opposing status or outcome language.'
        }
      ])
    ).toEqual(['conflict:status_mismatch:block:ev_one,ev_two'])
  })
})
