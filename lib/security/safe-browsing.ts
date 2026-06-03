export interface SafeBrowsingResult {
  safe: boolean
  checked: boolean
  threatTypes: string[]
  reason?: 'invalid_url' | 'not_configured' | 'proxy_error' | 'upstream_error'
}

const MAX_SAFE_BROWSING_CACHE = 500

const cache = new Map<string, SafeBrowsingResult>()
const inflight = new Map<string, Promise<SafeBrowsingResult>>()

function evictIfNeeded() {
  if (cache.size <= MAX_SAFE_BROWSING_CACHE) return
  const firstKey = cache.keys().next().value
  if (firstKey !== undefined) cache.delete(firstKey)
}

function normalizeSafeBrowsingUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

function failOpen(reason: SafeBrowsingResult['reason']): SafeBrowsingResult {
  return {
    safe: true,
    checked: false,
    threatTypes: [],
    reason
  }
}

async function requestSafeBrowsingCheck(
  normalizedUrl: string
): Promise<SafeBrowsingResult> {
  try {
    const response = await fetch('/api/safe-browsing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ url: normalizedUrl }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000)
    })

    if (!response.ok) return failOpen('proxy_error')

    const payload = (await response.json()) as Partial<SafeBrowsingResult>
    return {
      safe: typeof payload.safe === 'boolean' ? payload.safe : true,
      checked: payload.checked === true,
      threatTypes: Array.isArray(payload.threatTypes)
        ? payload.threatTypes.filter(
            (threatType): threatType is string => typeof threatType === 'string'
          )
        : [],
      reason: payload.reason
    }
  } catch {
    return failOpen('proxy_error')
  }
}

export async function checkSafeBrowsingUrl(
  url: string
): Promise<SafeBrowsingResult> {
  const normalizedUrl = normalizeSafeBrowsingUrl(url)
  if (!normalizedUrl) return failOpen('invalid_url')

  const cached = cache.get(normalizedUrl)
  if (cached) return cached

  const existing = inflight.get(normalizedUrl)
  if (existing) return existing

  const promise = requestSafeBrowsingCheck(normalizedUrl).then(result => {
    inflight.delete(normalizedUrl)
    cache.set(normalizedUrl, result)
    evictIfNeeded()
    return result
  })

  inflight.set(normalizedUrl, promise)
  return promise
}
