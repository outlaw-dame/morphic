import { z } from 'zod'

import { getConfiguredMistralNativeWebSearchEnabled } from '@/lib/mistral/api-key'

export const MISTRAL_SERVER_TOOLS_HEADER = 'x-morphic-mistral-server-tools'

export const MISTRAL_SOURCE_FIRST_NATIVE_SEARCH_GUIDANCE =
  'Mistral native web search is available only as a supplemental cross-check path. Keep Gist source-first: use the app search, feedSearch, fetch, mapSearch, googleFactCheck, and sourcePreferences tools for user-facing evidence, source cards, source preferences, Safe Browsing, feed blending, and citations. Use Mistral native web_search only to discover gaps, corroborate, or challenge the app-native evidence. Do not rely on native-search output as final user-facing citation evidence unless the same URL or claim is also represented through the app source pipeline.'

const nativeWebSearchConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    tool: z.enum(['web_search', 'web_search_premium']).optional(),
    premiumEnabled: z.boolean().optional(),
    maxRetries: z.number().int().min(0).max(4).optional(),
    timeoutMs: z.number().int().min(1000).max(30_000).optional()
  })
  .strict()

const serverToolsConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    webSearch: nativeWebSearchConfigSchema.optional()
  })
  .strict()

export type MistralServerToolsConfig = z.infer<typeof serverToolsConfigSchema>

type MistralProviderOptions = {
  mistral?: {
    serverTools?: MistralServerToolsConfig
  }
}

type MistralNativeWebSearchConfig = NonNullable<
  MistralServerToolsConfig['webSearch']
>

function envFlag(name: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(
    String(process.env[name] ?? '')
      .trim()
      .toLowerCase()
  )
}

function envBool(name: string): boolean | undefined {
  const value = process.env[name]
  if (!value) return undefined

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return undefined
}

function envInt(name: string): number | undefined {
  const value = process.env[name]
  if (!value) return undefined

  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : undefined
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T
}

function encodeHeader(value: MistralServerToolsConfig): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

export function decodeMistralServerToolsHeader(
  value: string
): MistralServerToolsConfig | null {
  try {
    return sanitizeMistralServerToolsConfig(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    )
  } catch {
    return null
  }
}

export function sanitizeMistralServerToolsConfig(
  value: unknown
): MistralServerToolsConfig | null {
  const parsed = serverToolsConfigSchema.safeParse(value)
  if (!parsed.success || parsed.data.enabled !== true) {
    return null
  }

  const webSearch = parsed.data.webSearch
  if (webSearch?.enabled !== true) {
    return null
  }

  const tool: MistralNativeWebSearchConfig['tool'] =
    webSearch.tool ?? 'web_search'
  if (tool === 'web_search_premium' && webSearch.premiumEnabled !== true) {
    return null
  }

  return {
    enabled: true,
    webSearch: {
      ...webSearch,
      enabled: true,
      tool
    }
  }
}

export function createMistralServerToolsProviderOptions(
  config: MistralServerToolsConfig
): MistralProviderOptions {
  const sanitized = sanitizeMistralServerToolsConfig(config)
  return sanitized ? { mistral: { serverTools: sanitized } } : {}
}

export function createMistralServerToolsProviderOptionsFromEnv(): MistralProviderOptions {
  if (!getConfiguredMistralNativeWebSearchEnabled()) {
    return {}
  }

  return createMistralServerToolsProviderOptions({
    enabled: true,
    webSearch: pruneUndefined({
      enabled: true,
      tool: process.env.MISTRAL_NATIVE_WEB_SEARCH_TOOL as
        | MistralNativeWebSearchConfig['tool']
        | undefined,
      premiumEnabled: envBool('MISTRAL_NATIVE_WEB_SEARCH_PREMIUM_ENABLED'),
      maxRetries: envInt('MISTRAL_NATIVE_WEB_SEARCH_MAX_RETRIES'),
      timeoutMs: envInt('MISTRAL_NATIVE_WEB_SEARCH_TIMEOUT_MS')
    })
  })
}

export function createMistralServerToolsProviderOptionsForUser(
  nativeWebSearchEnabled: boolean
): MistralProviderOptions {
  if (!nativeWebSearchEnabled) {
    return {}
  }

  const webSearch: MistralNativeWebSearchConfig = {
    enabled: true,
    tool: 'web_search',
    maxRetries: envInt('MISTRAL_NATIVE_WEB_SEARCH_MAX_RETRIES'),
    timeoutMs: envInt('MISTRAL_NATIVE_WEB_SEARCH_TIMEOUT_MS')
  }

  return createMistralServerToolsProviderOptions({
    enabled: true,
    webSearch: pruneUndefined(webSearch)
  })
}

export function buildMistralServerToolHeaders(
  providerId: string,
  providerOptions?: Record<string, unknown>
): Record<string, string> {
  if (providerId !== 'mistral') return {}

  const config = sanitizeMistralServerToolsConfig(
    (providerOptions as MistralProviderOptions | undefined)?.mistral
      ?.serverTools
  )

  return config
    ? {
        [MISTRAL_SERVER_TOOLS_HEADER]: encodeHeader(config)
      }
    : {}
}

export function hasMistralNativeWebSearchEnabled(
  providerId: string,
  providerOptions?: Record<string, unknown>
): boolean {
  if (providerId !== 'mistral') return false

  const config = sanitizeMistralServerToolsConfig(
    (providerOptions as MistralProviderOptions | undefined)?.mistral
      ?.serverTools
  )

  return config?.webSearch?.enabled === true
}

function toMistralTool(config: MistralServerToolsConfig) {
  return {
    type: config.webSearch?.tool ?? 'web_search'
  }
}

export function appendMistralServerToolsToRequest(
  body: BodyInit | null | undefined,
  headers: Headers
): BodyInit | null | undefined {
  const encoded = headers.get(MISTRAL_SERVER_TOOLS_HEADER)
  headers.delete(MISTRAL_SERVER_TOOLS_HEADER)
  if (!encoded || typeof body !== 'string') return body

  const config = decodeMistralServerToolsHeader(encoded)
  if (!config) return body

  try {
    const json = JSON.parse(body)
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      return body
    }

    const existingTools = Array.isArray(json.tools) ? json.tools : []
    const existingTypes = new Set(
      existingTools
        .map((tool: unknown) =>
          tool && typeof tool === 'object'
            ? String((tool as Record<string, unknown>).type ?? '')
            : ''
        )
        .filter(Boolean)
    )
    const nativeTool = toMistralTool(config)

    json.tools = existingTypes.has(nativeTool.type)
      ? existingTools
      : [...existingTools, nativeTool]

    return JSON.stringify(json)
  } catch {
    return body
  }
}
