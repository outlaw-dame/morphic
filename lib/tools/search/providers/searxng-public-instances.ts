const DEFAULT_INDEX_URL = 'https://searx.space/data/instances.json'
const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000
const DEFAULT_INDEX_TIMEOUT_MS = 4000
const DEFAULT_INSTANCE_LIMIT = 4

interface PublicInstanceCache {
  expiresAt: number
  urls: string[]
}

let publicInstanceCache: PublicInstanceCache | undefined

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return Math.trunc(parsed)
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local')
  ) {
    return true
  }

  if (/^(10|127)\./.test(normalized)) return true
  if (/^192\.168\./.test(normalized)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)) return true
  if (normalized === '::1' || normalized.startsWith('fc')) return true

  return false
}

function normalizePublicBaseUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    const requireHttps = process.env.SEARXNG_PUBLIC_REQUIRE_HTTPS !== 'false'
    if (requireHttps && url.protocol !== 'https:') {
      return null
    }
    if (!['https:', 'http:'].includes(url.protocol)) {
      return null
    }
    if (url.username || url.password) {
      return null
    }
    if (isPrivateOrLocalHostname(url.hostname)) {
      return null
    }
    url.pathname = url.pathname.replace(/\/+$/, '')
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function parseConfiguredPublicInstances(): string[] {
  const raw = process.env.SEARXNG_PUBLIC_INSTANCES
  if (!raw) {
    return []
  }

  return Array.from(
    new Set(
      raw
        .split(',')
        .map(value => normalizePublicBaseUrl(value.trim()))
        .filter((value): value is string => Boolean(value))
    )
  )
}

function isHealthyInstance(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return true
  }

  const instance = value as Record<string, any>
  if (
    typeof instance.network_type === 'string' &&
    instance.network_type !== 'normal'
  ) {
    return false
  }

  const api = instance.api
  if (api === false) {
    return false
  }
  if (api && typeof api === 'object' && (api.error || api.errors)) {
    return false
  }

  const httpGrade = instance.http?.grade
  if (typeof httpGrade === 'string' && /^[DEFX]/i.test(httpGrade)) {
    return false
  }

  const tlsGrade = instance.tls?.grade
  if (typeof tlsGrade === 'string' && /^[DEFX]/i.test(tlsGrade)) {
    return false
  }

  return true
}

function parseInstanceIndex(json: unknown): string[] {
  if (!json || typeof json !== 'object') {
    return []
  }

  const instances = (json as Record<string, any>).instances
  if (!instances || typeof instances !== 'object') {
    return []
  }

  const urls: string[] = []
  for (const [rawUrl, metadata] of Object.entries(instances)) {
    const url = normalizePublicBaseUrl(rawUrl)
    if (url && isHealthyInstance(metadata)) {
      urls.push(url)
    }
  }

  return Array.from(new Set(urls))
}

function rotateCandidates(urls: string[]): string[] {
  if (urls.length <= 1) {
    return urls
  }

  const offset = Math.floor(Date.now() / 60_000) % urls.length
  return [...urls.slice(offset), ...urls.slice(0, offset)]
}

export function isPublicSearXNGEnabled(): boolean {
  return process.env.SEARXNG_PUBLIC_INSTANCES_ENABLED === 'true'
}

export async function getPublicSearXNGInstanceUrls(): Promise<string[]> {
  if (!isPublicSearXNGEnabled()) {
    return []
  }

  const configured = parseConfiguredPublicInstances()
  if (configured.length > 0) {
    return rotateCandidates(configured).slice(
      0,
      positiveInteger(
        process.env.SEARXNG_PUBLIC_INSTANCE_LIMIT,
        DEFAULT_INSTANCE_LIMIT
      )
    )
  }

  const now = Date.now()
  if (publicInstanceCache && publicInstanceCache.expiresAt > now) {
    return rotateCandidates(publicInstanceCache.urls).slice(
      0,
      positiveInteger(
        process.env.SEARXNG_PUBLIC_INSTANCE_LIMIT,
        DEFAULT_INSTANCE_LIMIT
      )
    )
  }

  const indexUrl =
    process.env.SEARXNG_PUBLIC_INSTANCES_INDEX_URL || DEFAULT_INDEX_URL
  const timeoutMs = positiveInteger(
    process.env.SEARXNG_PUBLIC_INDEX_TIMEOUT_MS,
    DEFAULT_INDEX_TIMEOUT_MS
  )

  const response = await fetch(indexUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs)
  })

  if (!response.ok) {
    throw new Error(`SearXNG public instance index failed: ${response.status}`)
  }

  const urls = parseInstanceIndex(await response.json())
  publicInstanceCache = {
    urls,
    expiresAt:
      now +
      positiveInteger(
        process.env.SEARXNG_PUBLIC_CACHE_TTL_MS,
        DEFAULT_CACHE_TTL_MS
      )
  }

  return rotateCandidates(urls).slice(
    0,
    positiveInteger(
      process.env.SEARXNG_PUBLIC_INSTANCE_LIMIT,
      DEFAULT_INSTANCE_LIMIT
    )
  )
}

export function clearPublicSearXNGInstanceCache() {
  publicInstanceCache = undefined
}
