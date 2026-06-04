export const WOLFRAM_ALPHA_APP_ID_COOKIE = 'morphicWolframAlphaAppId'
export const WOLFRAM_ALPHA_APP_ID_MAX_AGE = 60 * 60 * 24 * 365

const WOLFRAM_ALPHA_APP_ID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/

export type WolframAlphaAppIdSource = 'user' | 'environment' | 'none'

export function normalizeWolframAlphaAppId(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!WOLFRAM_ALPHA_APP_ID_PATTERN.test(trimmed)) return null

  return trimmed
}

export function getEnvironmentWolframAlphaAppId(): string | null {
  return normalizeWolframAlphaAppId(
    process.env.WOLFRAM_ALPHA_APP_ID ||
      process.env.WOLFRAMALPHA_APP_ID ||
      process.env.WOLFRAM_APP_ID
  )
}

export function maskWolframAlphaAppId(appId: string | null | undefined) {
  const normalized = normalizeWolframAlphaAppId(appId)
  if (!normalized) return null

  if (normalized.length <= 8) {
    return `${normalized.slice(0, 2)}...${normalized.slice(-2)}`
  }

  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`
}

export function getWolframAlphaAppIdStatus(userAppId?: string | null) {
  const normalizedUserAppId = normalizeWolframAlphaAppId(userAppId)
  const environmentAppId = getEnvironmentWolframAlphaAppId()

  const source: WolframAlphaAppIdSource = normalizedUserAppId
    ? 'user'
    : environmentAppId
      ? 'environment'
      : 'none'

  return {
    hasUserAppId: Boolean(normalizedUserAppId),
    hasEnvironmentAppId: Boolean(environmentAppId),
    maskedUserAppId: maskWolframAlphaAppId(normalizedUserAppId),
    source
  }
}
