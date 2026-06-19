import { describe, expect, it } from 'vitest'

import {
  buildCrashMetadata,
  classifyRoute,
  containsSensitiveData,
  redactSensitiveData
} from '../redaction'

describe('redactSensitiveData', () => {
  it('redacts API keys', () => {
    const input = 'Error with key sk-abc123def456ghi789'
    const result = redactSensitiveData(input)
    expect(result).toContain('[REDACTED_API_KEY]')
    expect(result).not.toContain('sk-abc123def456ghi789')
  })

  it('redacts segmented API keys (sk-proj-...)', () => {
    const input = 'key: sk-proj-abc123_def456-ghi789xyz'
    const result = redactSensitiveData(input)
    expect(result).toContain('[REDACTED_API_KEY]')
    expect(result).not.toContain('sk-proj-abc123')
  })

  it('redacts Bearer tokens with base64 characters', () => {
    const input = 'Auth: Bearer eyJhbGciOiJIUzI1NiJ9.pay+load/data=.sig+nal='
    const result = redactSensitiveData(input)
    expect(result).toContain('Bearer [REDACTED]')
    expect(result).not.toContain('eyJhbGci')
  })

  it('redacts Bearer tokens', () => {
    const input = 'Auth: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig'
    const result = redactSensitiveData(input)
    expect(result).toContain('Bearer [REDACTED]')
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9')
  })

  it('redacts email addresses', () => {
    const input = 'User user@example.com reported an error'
    const result = redactSensitiveData(input)
    expect(result).toContain('[REDACTED_EMAIL]')
    expect(result).not.toContain('user@example.com')
  })

  it('redacts sensitive URL query params preserving structure', () => {
    const input = 'Request to /api?token=secret123&page=1'
    const result = redactSensitiveData(input)
    expect(result).not.toContain('secret123')
    expect(result).toContain('token=[REDACTED]')
    expect(result).toContain('page=1')
  })

  it('redacts UUIDs', () => {
    const input = 'User 550e8400-e29b-41d4-a716-446655440000 not found'
    const result = redactSensitiveData(input)
    expect(result).toContain('[UUID]')
    expect(result).not.toContain('550e8400-e29b-41d4-a716-446655440000')
  })

  it('redacts home directory paths', () => {
    const input = 'File at /Users/johndoe/documents/secret.txt'
    const result = redactSensitiveData(input)
    expect(result).toContain('/Users/[REDACTED]')
    expect(result).not.toContain('johndoe')
  })

  it('redacts IP addresses', () => {
    const input = 'Connected from 192.168.1.100'
    const result = redactSensitiveData(input)
    expect(result).toContain('[IP]')
    expect(result).not.toContain('192.168.1.100')
  })

  it('returns input unchanged if nothing to redact', () => {
    const input = 'Simple error on search page'
    expect(redactSensitiveData(input)).toBe(input)
  })

  it('handles multiple patterns in one string', () => {
    const input = 'User user@test.com with key sk-abcdefghijklmnop at 10.0.0.1'
    const result = redactSensitiveData(input)
    expect(result).not.toContain('user@test.com')
    expect(result).not.toContain('sk-abcdefghijklmnop')
    expect(result).not.toContain('10.0.0.1')
  })
})

describe('classifyRoute', () => {
  it('classifies home', () => {
    expect(classifyRoute('/')).toBe('/home')
  })

  it('classifies search result with dynamic ID', () => {
    expect(classifyRoute('/search/abc123')).toBe('/search/[id]')
  })

  it('classifies search index', () => {
    expect(classifyRoute('/search')).toBe('/search')
  })

  it('classifies discovery', () => {
    expect(classifyRoute('/discovery')).toBe('/discovery')
  })

  it('classifies auth routes generically', () => {
    expect(classifyRoute('/auth/login')).toBe('/auth/[action]')
    expect(classifyRoute('/auth/oauth')).toBe('/auth/[action]')
  })

  it('classifies unknown routes as [other]', () => {
    expect(classifyRoute('/admin/secret')).toBe('/[other]')
  })
})

describe('buildCrashMetadata', () => {
  it('builds metadata with provided values', () => {
    const meta = buildCrashMetadata({
      appVersion: '1.4.0',
      platform: 'ios',
      runtimeKind: 'capacitor',
      routeClass: '/search/[id]',
      networkClass: 'online'
    })
    expect(meta.app_version).toBe('1.4.0')
    expect(meta.platform).toBe('ios')
    expect(meta.runtime).toBe('capacitor')
    expect(meta.route_class).toBe('/search/[id]')
  })

  it('uses defaults for missing values', () => {
    const meta = buildCrashMetadata({})
    expect(meta.app_version).toBe('unknown')
    expect(meta.platform).toBe('unknown')
  })
})

describe('containsSensitiveData', () => {
  it('returns true for strings with API keys', () => {
    expect(containsSensitiveData('key sk-test1234567890abc')).toBe(true)
  })

  it('returns false for clean strings', () => {
    expect(containsSensitiveData('Normal error message')).toBe(false)
  })

  it('returns true for emails', () => {
    expect(containsSensitiveData('hello@world.com')).toBe(true)
  })
})
