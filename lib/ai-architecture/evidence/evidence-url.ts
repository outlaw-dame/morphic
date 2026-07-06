const ALLOWED_EVIDENCE_PROTOCOLS = new Set(['http:', 'https:'])

export type CanonicalEvidenceUrl = {
  originalUrl: string
  canonicalUrl: string
  host: string
}

export function canonicalizeEvidenceUrl(url: string): CanonicalEvidenceUrl | null {
  try {
    const parsed = new URL(url)
    if (!ALLOWED_EVIDENCE_PROTOCOLS.has(parsed.protocol)) return null

    parsed.username = ''
    parsed.password = ''
    parsed.hash = ''
    parsed.hostname = parsed.hostname.toLowerCase()

    if (
      (parsed.protocol === 'https:' && parsed.port === '443') ||
      (parsed.protocol === 'http:' && parsed.port === '80')
    ) {
      parsed.port = ''
    }

    if (parsed.pathname !== '/') {
      parsed.pathname = parsed.pathname.replace(/\/+$/g, '') || '/'
    }

    return {
      originalUrl: url,
      canonicalUrl: parsed.toString(),
      host: parsed.hostname
    }
  } catch {
    return null
  }
}

export function evidenceIdFromUrl(canonicalUrl: string): string {
  let hash = 2166136261
  for (let index = 0; index < canonicalUrl.length; index += 1) {
    hash ^= canonicalUrl.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `ev_${(hash >>> 0).toString(36)}`
}
