/**
 * Share content policy — defines what can and cannot be shared.
 *
 * Rules:
 * - Share result links (safe, public URLs)
 * - Share search/session links only when safe (no private query dump)
 * - Never share raw auth tokens, API keys, or private content
 * - Validate share content before passing to native share sheet
 */

export interface ShareContentValidation {
  allowed: boolean
  reason?: string
  sanitizedData?: { title?: string; text?: string; url?: string }
}

/** Maximum length for shared text to prevent accidental large data dumps */
const MAX_SHARE_TEXT_LENGTH = 2000

/** Patterns that should never appear in shared content */
const FORBIDDEN_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/, // OpenAI API keys
  /key-[a-zA-Z0-9]{20,}/, // Generic API keys
  /Bearer\s+[a-zA-Z0-9._-]+/, // Auth tokens
  /password[=:]\s*\S+/i, // Password values
  /secret[=:]\s*\S+/i // Secret values
]

/**
 * Validate and sanitize content before sharing.
 *
 * Ensures no sensitive data leaks through the share sheet.
 */
export function validateShareContent(data: {
  title?: string
  text?: string
  url?: string
}): ShareContentValidation {
  // URL must be internal or a safe https URL
  if (data.url) {
    if (!isValidShareUrl(data.url)) {
      return { allowed: false, reason: 'Cannot share this URL' }
    }
  }

  // Check text for forbidden patterns
  const textToCheck = [data.title, data.text].filter(Boolean).join(' ')
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(textToCheck)) {
      return { allowed: false, reason: 'Content contains sensitive data' }
    }
  }

  // Truncate overly long text
  const sanitizedText = data.text
    ? data.text.slice(0, MAX_SHARE_TEXT_LENGTH)
    : undefined

  const sanitizedTitle = data.title ? data.title.slice(0, 200) : undefined

  return {
    allowed: true,
    sanitizedData: {
      title: sanitizedTitle,
      text: sanitizedText,
      url: data.url
    }
  }
}

/**
 * Check if a URL is safe to share.
 *
 * Allows:
 * - Internal app URLs (morphic.sh)
 * - HTTPS external URLs
 *
 * Rejects:
 * - Non-HTTPS URLs
 * - javascript:, data:, file: schemes
 * - URLs with auth tokens in query params
 */
/** Sensitive parameter names that should never appear in shared URLs */
const SENSITIVE_SHARE_PARAMS = [
  'token',
  'access_token',
  'api_key',
  'secret',
  'password'
]

/** Pre-compiled boundary-aware regex for hash fragment sensitive param detection */
const HASH_SENSITIVE_PATTERN = new RegExp(
  `(?:^|[?&;/#])(?:${SENSITIVE_SHARE_PARAMS.join('|')})=`,
  'i'
)

function isValidShareUrl(url: string): boolean {
  let parsed: URL
  try {
    // Handle relative URLs by resolving against app origin
    parsed = new URL(url, 'https://morphic.sh')
  } catch {
    return false
  }

  // Only HTTPS is shareable
  if (parsed.protocol !== 'https:') return false

  // Reject URLs with sensitive query params (case-insensitive)
  for (const [key] of parsed.searchParams) {
    if (SENSITIVE_SHARE_PARAMS.includes(key.toLowerCase())) return false
  }

  // Reject URLs with sensitive data in hash/fragment
  // Handle SPA hash routing: #/path?param=value — extract query after ?
  if (parsed.hash) {
    const hashContent = parsed.hash.slice(1).toLowerCase()
    const queryStart = hashContent.indexOf('?')
    const hashQuery =
      queryStart >= 0 ? hashContent.slice(queryStart + 1) : hashContent
    const hashParams = new URLSearchParams(hashQuery)
    for (const param of SENSITIVE_SHARE_PARAMS) {
      if (hashParams.has(param)) return false
    }
    // Boundary-aware fallback for unusual formats (nested # delimiters etc.)
    if (HASH_SENSITIVE_PATTERN.test(hashContent)) return false
  }

  return true
}

/**
 * Build a safe share URL for a search result.
 *
 * Always uses the public app URL, never includes session-specific params.
 */
export function buildSearchShareUrl(searchId: string): string {
  return `https://morphic.sh/search/${encodeURIComponent(searchId)}`
}

/**
 * Build safe share data for a search result.
 */
export function buildSearchShareData(
  searchId: string,
  title?: string
): {
  title: string
  url: string
} {
  return {
    title: title || 'Check out this search on Morphic',
    url: buildSearchShareUrl(searchId)
  }
}
