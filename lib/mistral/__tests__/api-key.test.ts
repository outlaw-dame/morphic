import { describe, expect, it } from 'vitest'

import {
  getConfiguredMistralApiKey,
  getMistralNativeWebSearchEnabledFromCookieStore,
  sanitizeMistralApiKey
} from '../api-key'

describe('Mistral API key and native search settings', () => {
  it('sanitizes plausible Mistral API keys without accepting whitespace', () => {
    expect(sanitizeMistralApiKey('  mt-1234567890abcdef  ')).toBe(
      'mt-1234567890abcdef'
    )
    expect(sanitizeMistralApiKey('bad key')).toBeNull()
    expect(sanitizeMistralApiKey('short')).toBeNull()
  })

  it('prefers a valid user cookie key over the environment key', () => {
    process.env.MISTRAL_API_KEY = 'mt-env-key-123456'
    const cookieStore = {
      get: (name: string) =>
        name === 'mistral_api_key'
          ? { name, value: 'mt-user-key-123456' }
          : undefined
    } as any

    expect(getConfiguredMistralApiKey(cookieStore)).toBe('mt-user-key-123456')

    delete process.env.MISTRAL_API_KEY
  })

  it('reads standard native web search as an explicit user preference', () => {
    const enabledStore = {
      get: (name: string) =>
        name === 'mistral_native_web_search_enabled'
          ? { name, value: 'true' }
          : undefined
    } as any
    const disabledStore = {
      get: (name: string) =>
        name === 'mistral_native_web_search_enabled'
          ? { name, value: 'false' }
          : undefined
    } as any

    expect(getMistralNativeWebSearchEnabledFromCookieStore(enabledStore)).toBe(
      true
    )
    expect(getMistralNativeWebSearchEnabledFromCookieStore(disabledStore)).toBe(
      false
    )
  })
})
