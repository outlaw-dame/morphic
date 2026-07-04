import { describe, expect, it } from 'vitest'

import { parseRoleOutput } from './role-output-parsers'

describe('role output parsers', () => {
  it('parses valid router output', () => {
    const result = parseRoleOutput('router', {
      mode: 'quick',
      riskLevel: 'low',
      rationale: 'Simple factual request.'
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.maxToolCalls).toBe(20)
    }
  })

  it('returns trace-safe validation errors for invalid structured output', () => {
    const result = parseRoleOutput('router', {
      mode: 'not-a-mode',
      riskLevel: 'low',
      rationale: ''
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Invalid structured output for router')
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues.join('\n')).not.toContain('reasoning')
    }
  })

  it('parses advisor findings as arrays', () => {
    const result = parseRoleOutput('advisor', [
      {
        severity: 'warning',
        finding: 'Claim needs stronger source support.',
        recommendation: 'Add primary evidence before final answer.'
      }
    ])

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value[0].requiresRepair).toBe(false)
    }
  })
})
