import { describe, expect, it } from 'vitest'

import {
  getFileInputAccept,
  isAllowedMimeType,
  MAX_FILE_SIZE_BYTES,
  validateFile
} from '../file-policy'

describe('validateFile', () => {
  it('accepts valid PDF within size limit', () => {
    const result = validateFile({ size: 1024, type: 'application/pdf' })
    expect(result.valid).toBe(true)
  })

  it('accepts valid image types', () => {
    expect(validateFile({ size: 500, type: 'image/jpeg' }).valid).toBe(true)
    expect(validateFile({ size: 500, type: 'image/png' }).valid).toBe(true)
    expect(validateFile({ size: 500, type: 'image/webp' }).valid).toBe(true)
  })

  it('rejects files exceeding max size', () => {
    const result = validateFile({
      size: MAX_FILE_SIZE_BYTES + 1,
      type: 'image/png'
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('maximum size')
  })

  it('rejects empty files', () => {
    const result = validateFile({ size: 0, type: 'image/png' })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('empty')
  })

  it('rejects JavaScript files', () => {
    const result = validateFile({ size: 100, type: 'application/javascript' })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('not allowed')
  })

  it('rejects executable files', () => {
    const result = validateFile({ size: 100, type: 'application/x-executable' })
    expect(result.valid).toBe(false)
  })

  it('rejects unknown MIME types', () => {
    const result = validateFile({
      size: 100,
      type: 'application/x-custom-format'
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('Unsupported')
  })

  it('accepts text/plain', () => {
    expect(validateFile({ size: 100, type: 'text/plain' }).valid).toBe(true)
  })

  it('accepts text/csv', () => {
    expect(validateFile({ size: 100, type: 'text/csv' }).valid).toBe(true)
  })
})

describe('isAllowedMimeType', () => {
  it('returns true for PDF', () => {
    expect(isAllowedMimeType('application/pdf')).toBe(true)
  })

  it('returns false for executable', () => {
    expect(isAllowedMimeType('application/x-executable')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isAllowedMimeType('IMAGE/JPEG')).toBe(true)
  })
})

describe('getFileInputAccept', () => {
  it('returns comma-separated MIME types', () => {
    const accept = getFileInputAccept()
    expect(accept).toContain('application/pdf')
    expect(accept).toContain('image/jpeg')
    expect(accept.split(',')).toHaveLength(10) // 10 allowed types
  })
})
