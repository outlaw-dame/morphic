import { describe, expect, it } from 'vitest'

import { convertDataPart } from './convert-data-part'

describe('convertDataPart', () => {
  it('wraps pasted content in nonce-delimited boundaries', () => {
    const result = convertDataPart({
      type: 'data-pastedContent',
      data: { text: 'large pasted text' }
    })

    expect(result?.type).toBe('text')
    expect(result?.text).toContain('large pasted text')
    expect(result?.text).toMatch(/\[user-pasted-content [a-f0-9-]+\]/)
    expect(result?.text).toMatch(/\[\/user-pasted-content [a-f0-9-]+\]/)
  })

  it('converts source URL data parts to text', () => {
    expect(
      convertDataPart({ type: 'data-sourceUrl', data: { url: 'https://example.com' } })
    ).toEqual({ type: 'text', text: 'https://example.com' })
  })

  it('drops unknown or malformed data parts', () => {
    expect(convertDataPart({ type: 'data-pastedContent', data: {} })).toBeUndefined()
    expect(convertDataPart({ type: 'unknown', data: {} })).toBeUndefined()
  })
})
