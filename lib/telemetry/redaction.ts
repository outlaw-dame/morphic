/**
 * Privacy-safe telemetry redaction.
 *
 * Ensures sensitive data is never sent to crash reporting or observability services.
 * All telemetry data passes through this module before leaving the client.
 */

/** Patterns that must be redacted from any telemetry string */
const REDACTION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // API keys (sk-... including segmented variants like sk-proj-...)
  { pattern: /sk-[a-zA-Z0-9_-]{10,}/g, replacement: '[REDACTED_API_KEY]' },
  { pattern: /key-[a-zA-Z0-9_-]{10,}/g, replacement: '[REDACTED_KEY]' },
  // Bearer tokens (base64/base64url charset: alphanumeric + . _ - + / =)
  {
    pattern: /Bearer\s+[a-zA-Z0-9._\-+/=]+/gi,
    replacement: 'Bearer [REDACTED]'
  },
  // Email addresses
  {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[REDACTED_EMAIL]'
  },
  // URLs with sensitive query params (captures delimiter to preserve URL structure)
  {
    pattern: /([?&])(token|access_token|api_key|secret|password)=[^&\s]*/gi,
    replacement: '$1$2=[REDACTED]'
  },
  // UUIDs (could be user IDs)
  {
    pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    replacement: '[UUID]'
  },
  // Home directory paths (Unix + Windows)
  { pattern: /\/Users\/[^/\s]+/g, replacement: '/Users/[REDACTED]' },
  { pattern: /\/home\/[^/\s]+/g, replacement: '/home/[REDACTED]' },
  { pattern: /C:\\Users\\[^\\\s]+/gi, replacement: 'C:\\Users\\[REDACTED]' },
  // IP addresses
  {
    pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    replacement: '[IP]'
  }
]

/**
 * Redact sensitive information from a telemetry string.
 *
 * Safe to call on any string — returns the original if no patterns match.
 */
export function redactSensitiveData(input: string): string {
  let result = input
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    pattern.lastIndex = 0
    result = result.replace(pattern, replacement)
  }
  return result
}

/**
 * Classify a route path for telemetry purposes.
 *
 * Returns a generic route class instead of the full path with dynamic segments.
 */
export function classifyRoute(pathname: string): string {
  if (pathname === '/') return '/home'
  if (pathname.startsWith('/search/')) return '/search/[id]'
  if (pathname === '/search') return '/search'
  if (pathname === '/discovery') return '/discovery'
  if (pathname === '/library') return '/library'
  if (pathname === '/settings') return '/settings'
  if (pathname === '/reader') return '/reader'
  if (pathname.startsWith('/auth/')) return '/auth/[action]'
  return '/[other]'
}

/**
 * Build safe crash report metadata.
 *
 * Only includes non-sensitive contextual information.
 */
export function buildCrashMetadata(
  options: {
    appVersion?: string
    platform?: string
    runtimeKind?: string
    routeClass?: string
    networkClass?: 'online' | 'offline' | 'unknown'
  } = {}
): Record<string, string> {
  return {
    app_version: options.appVersion ?? 'unknown',
    platform: options.platform ?? 'unknown',
    runtime: options.runtimeKind ?? 'unknown',
    route_class: options.routeClass ?? '/[unknown]',
    network: options.networkClass ?? 'unknown'
  }
}

/**
 * Check if a string contains potentially sensitive data.
 *
 * Useful for pre-flight checks before sending to telemetry.
 */
export function containsSensitiveData(input: string): boolean {
  for (const { pattern } of REDACTION_PATTERNS) {
    pattern.lastIndex = 0
    if (pattern.test(input)) return true
  }
  return false
}
