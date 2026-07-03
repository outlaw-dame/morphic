import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'

export const MISTRAL_API_KEY_COOKIE = 'mistral_api_key'
export const MISTRAL_NATIVE_WEB_SEARCH_ENABLED_COOKIE =
  'mistral_native_web_search_enabled'

const MAX_MISTRAL_API_KEY_LENGTH = 1024

export function sanitizeMistralApiKey(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (
    trimmed.length < 8 ||
    trimmed.length > MAX_MISTRAL_API_KEY_LENGTH ||
    /\s/.test(trimmed)
  ) {
    return null
  }

  return trimmed
}

export function getMistralApiKeyFromCookieStore(
  cookieStore?: ReadonlyRequestCookies
): string | undefined {
  const value = cookieStore?.get(MISTRAL_API_KEY_COOKIE)?.value
  return sanitizeMistralApiKey(value) ?? undefined
}

export function getConfiguredMistralApiKey(
  cookieStore?: ReadonlyRequestCookies
): string | undefined {
  return (
    getMistralApiKeyFromCookieStore(cookieStore) ??
    sanitizeMistralApiKey(process.env.MISTRAL_API_KEY) ??
    undefined
  )
}

export function getMistralNativeWebSearchEnabledFromCookieStore(
  cookieStore?: ReadonlyRequestCookies
): boolean | undefined {
  const raw = cookieStore?.get(MISTRAL_NATIVE_WEB_SEARCH_ENABLED_COOKIE)?.value
  if (raw === 'true') return true
  if (raw === 'false') return false
  return undefined
}

export function getConfiguredMistralNativeWebSearchEnabled(
  cookieStore?: ReadonlyRequestCookies
): boolean {
  const userPreference =
    getMistralNativeWebSearchEnabledFromCookieStore(cookieStore)
  if (userPreference !== undefined) {
    return userPreference
  }

  return ['1', 'true', 'yes', 'on'].includes(
    String(process.env.MISTRAL_NATIVE_WEB_SEARCH_ENABLED ?? '')
      .trim()
      .toLowerCase()
  )
}
