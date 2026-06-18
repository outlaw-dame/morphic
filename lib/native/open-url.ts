/**
 * Safe external URL opening for mobile/native contexts.
 *
 * Rules:
 * - Only approved schemes are allowed (https, mailto, tel)
 * - Dangerous schemes (javascript, data, file, blob) are rejected
 * - Internal app URLs stay in the WebView
 * - External URLs open in the system browser (Capacitor) or new tab (web)
 * - No arbitrary redirect passthrough
 *
 * Safe for SSR: no-ops when window is unavailable.
 */

import { getRuntime } from './runtime'

export type OpenUrlResult =
  | { opened: true; method: 'system-browser' | 'new-tab' | 'in-app' }
  | { opened: false; reason: string }

/** Schemes that are never allowed to open */
const BLOCKED_SCHEMES = ['javascript:', 'data:', 'file:', 'blob:', 'vbscript:']

/** Schemes that are allowed for external opening */
const ALLOWED_EXTERNAL_SCHEMES = ['https:', 'http:', 'mailto:', 'tel:']

/** The app's own origin — stays in WebView */
const APP_ORIGINS = ['https://morphic.sh', 'https://www.morphic.sh']

/**
 * Check if a URL is an internal app route.
 */
export function isInternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return APP_ORIGINS.includes(parsed.origin)
  } catch {
    // Relative URLs are internal
    return url.startsWith('/')
  }
}

/**
 * Check if a scheme is blocked.
 */
function isBlockedScheme(url: string): boolean {
  const lower = url.toLowerCase().trim()
  return BLOCKED_SCHEMES.some(scheme => lower.startsWith(scheme))
}

/**
 * Check if a scheme is allowed for external navigation.
 */
function isAllowedExternalScheme(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ALLOWED_EXTERNAL_SCHEMES.includes(parsed.protocol)
  } catch {
    return false
  }
}

/**
 * Open a URL safely based on the current runtime context.
 *
 * - Internal URLs: navigate in-app (returns 'in-app', caller should use router)
 * - External URLs in Capacitor: open system browser via Capacitor Browser plugin bridge
 * - External URLs on web: open new tab via window.open
 * - Blocked schemes: rejected with reason
 */
export async function openUrl(url: string): Promise<OpenUrlResult> {
  if (typeof window === 'undefined') {
    return { opened: false, reason: 'Not available during SSR' }
  }

  // Block dangerous schemes
  if (isBlockedScheme(url)) {
    return { opened: false, reason: `Blocked scheme: ${url.split(':')[0]}` }
  }

  // Internal URLs stay in-app
  if (isInternalUrl(url)) {
    return { opened: true, method: 'in-app' }
  }

  // Only allow known external schemes
  if (!isAllowedExternalScheme(url)) {
    return { opened: false, reason: `Unsupported scheme: ${url.split(':')[0]}` }
  }

  const runtime = getRuntime()

  // On Capacitor: try to open in system browser via the global plugin bridge
  if (runtime.isCapacitor) {
    try {
      const cap = (window as any).Capacitor
      const browser = cap?.Plugins?.Browser
      if (browser && typeof browser.open === 'function') {
        await browser.open({ url })
        return { opened: true, method: 'system-browser' }
      }
    } catch {
      // Fall through to window.open
    }
  }

  // Web fallback: open in new tab
  try {
    window.open(url, '_blank', 'noopener,noreferrer')
    return { opened: true, method: 'new-tab' }
  } catch {
    return { opened: false, reason: 'Failed to open URL' }
  }
}

/**
 * Validate an OAuth redirect URL to prevent open-redirect attacks.
 *
 * Only allows redirects back to the app's own origin.
 */
export function isAllowedAuthRedirect(redirectUrl: string): boolean {
  try {
    const parsed = new URL(redirectUrl)
    return APP_ORIGINS.includes(parsed.origin)
  } catch {
    // Relative paths are fine
    return redirectUrl.startsWith('/')
  }
}
