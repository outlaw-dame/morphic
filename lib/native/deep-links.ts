/**
 * Deep link parsing and route authority.
 *
 * Validates incoming deep links (universal links / app links) to ensure:
 * - Only known hosts are accepted
 * - Only known routes are routable
 * - Unsafe redirect parameters are stripped
 * - Unknown schemes are rejected
 * - Fallback behavior is defined for each failure mode
 *
 * This module does NOT handle the native platform registration (associated domains,
 * intent filters). Those belong in the native project config (ios/, android/) once
 * committed.
 */

export interface DeepLinkParseResult {
  /** Whether the deep link is valid and routable */
  valid: boolean
  /** The normalized path to navigate to (if valid) */
  path: string | null
  /** The original URL that was parsed */
  originalUrl: string
  /** Whether the route requires authentication */
  requiresAuth: boolean
  /** Fallback behavior when the deep link cannot be resolved */
  fallback: 'home' | 'login' | 'not-found' | 'reject'
  /** Reason for rejection (if not valid) */
  reason?: string
}

/** Allowed hosts for deep links */
const ALLOWED_HOSTS = ['morphic.sh', 'www.morphic.sh']

/** Route allowlist with auth requirements */
const ROUTE_MAP: Array<{
  pattern: RegExp
  requiresAuth: boolean
  description: string
}> = [
  { pattern: /^\/$/, requiresAuth: false, description: 'Home' },
  { pattern: /^\/search$/, requiresAuth: false, description: 'Search' },
  {
    pattern: /^\/search\/[a-zA-Z0-9_-]+$/,
    requiresAuth: false,
    description: 'Search result'
  },
  { pattern: /^\/discovery$/, requiresAuth: false, description: 'Discovery' },
  { pattern: /^\/library$/, requiresAuth: true, description: 'Library' },
  { pattern: /^\/settings$/, requiresAuth: true, description: 'Settings' },
  { pattern: /^\/reader$/, requiresAuth: false, description: 'Reader' },
  {
    pattern:
      /^\/auth\/(login|sign-up|forgot-password|update-password|oauth|confirm)$/,
    requiresAuth: false,
    description: 'Auth pages'
  }
]

/** Query parameters that should be stripped (potential redirect vectors) */
const UNSAFE_PARAMS = [
  'redirect',
  'return_to',
  'continue',
  'next',
  'goto',
  'url'
]

/**
 * Parse and validate a deep link URL.
 *
 * Returns a structured result indicating whether the link is valid,
 * what path to navigate to, and what fallback to use if it's not.
 */
export function parseDeepLink(url: string): DeepLinkParseResult {
  const originalUrl = url

  // Parse the URL
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return {
      valid: false,
      path: null,
      originalUrl,
      requiresAuth: false,
      fallback: 'reject',
      reason: 'Invalid URL format'
    }
  }

  // Only allow https scheme
  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      path: null,
      originalUrl,
      requiresAuth: false,
      fallback: 'reject',
      reason: `Unsupported scheme: ${parsed.protocol}`
    }
  }

  // Validate host
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return {
      valid: false,
      path: null,
      originalUrl,
      requiresAuth: false,
      fallback: 'reject',
      reason: `Unknown host: ${parsed.hostname}`
    }
  }

  // Normalize path (remove trailing slash except root)
  let path = parsed.pathname
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1)
  }

  // Strip unsafe redirect parameters (except on auth callback routes where 'next' is needed)
  const isAuthCallback = path.startsWith('/auth/')
  const cleanParams = new URLSearchParams()
  for (const [key, value] of parsed.searchParams) {
    const lowerKey = key.toLowerCase()
    // Allow 'next' on auth routes (needed for OAuth/confirm post-login redirect)
    if (isAuthCallback && lowerKey === 'next') {
      // Validate that 'next' points to an internal path
      if (
        value.startsWith('/') &&
        !value.startsWith('//') &&
        !/^\/[\\]/.test(value)
      ) {
        cleanParams.append(key, value)
      }
      continue
    }
    if (!UNSAFE_PARAMS.includes(lowerKey)) {
      cleanParams.append(key, value)
    }
  }

  // Append clean query string if any remain
  const queryString = cleanParams.toString()
  const fullPath = queryString ? `${path}?${queryString}` : path

  // Match against route allowlist
  const matchedRoute = ROUTE_MAP.find(route => route.pattern.test(path))

  if (!matchedRoute) {
    return {
      valid: false,
      path: null,
      originalUrl,
      requiresAuth: false,
      fallback: 'not-found',
      reason: `Unknown route: ${path}`
    }
  }

  return {
    valid: true,
    path: fullPath,
    originalUrl,
    requiresAuth: matchedRoute.requiresAuth,
    fallback: matchedRoute.requiresAuth ? 'login' : 'home'
  }
}

/**
 * Handle a deep link with auth awareness.
 *
 * Returns the path to navigate to based on:
 * - Whether the link is valid
 * - Whether the user is authenticated
 * - The fallback behavior for the route
 */
export function resolveDeepLink(
  url: string,
  options: { isAuthenticated: boolean }
): { navigate: string; reason?: string } {
  const result = parseDeepLink(url)

  if (!result.valid) {
    return { navigate: '/', reason: result.reason }
  }

  // Route requires auth but user is not authenticated
  if (result.requiresAuth && !options.isAuthenticated) {
    return {
      navigate: `/auth/login?next=${encodeURIComponent(result.path!)}`,
      reason: 'Authentication required'
    }
  }

  return { navigate: result.path! }
}

/**
 * Get the canonical route map for documentation/testing purposes.
 */
export function getRouteMap(): Array<{
  pattern: string
  requiresAuth: boolean
  description: string
}> {
  return ROUTE_MAP.map(r => ({
    pattern: r.pattern.source,
    requiresAuth: r.requiresAuth,
    description: r.description
  }))
}
