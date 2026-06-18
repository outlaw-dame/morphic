/**
 * Mobile session state management.
 *
 * Provides session-state awareness for the native shell:
 * - Expired session detection
 * - Offline state detection
 * - Reconnect/retry guidance
 * - Provider unavailable state
 *
 * The hosted WebView remains the source of truth for authentication.
 * No auth tokens are stored in native storage.
 *
 * Safe for SSR: returns 'unknown' state.
 */

export type SessionState =
  | 'authenticated'
  | 'unauthenticated'
  | 'expired'
  | 'offline'
  | 'unknown'

export interface MobileSessionInfo {
  state: SessionState
  /** Whether the network is reachable */
  isOnline: boolean
  /** Whether a retry/reconnect is possible */
  canRetry: boolean
  /** Human-readable message for the current state */
  message: string
}

/**
 * Assess the current mobile session state.
 *
 * This is a client-side helper that checks network availability
 * and makes inferences about session health. The actual session
 * is managed server-side via Supabase cookies — this module
 * only provides UX signals.
 */
export function assessMobileSessionState(options: {
  hasUser: boolean
  isOnline?: boolean
}): MobileSessionInfo {
  // SSR: return unknown state
  if (typeof window === 'undefined') {
    return {
      state: 'unknown',
      isOnline: true,
      canRetry: false,
      message: ''
    }
  }

  const { hasUser } = options
  const isOnline = options.isOnline ?? navigator.onLine

  if (!isOnline) {
    return {
      state: 'offline',
      isOnline: false,
      canRetry: true,
      message: "You're offline. Connect to the internet to continue."
    }
  }

  if (hasUser) {
    return {
      state: 'authenticated',
      isOnline: true,
      canRetry: false,
      message: ''
    }
  }

  return {
    state: 'unauthenticated',
    isOnline: true,
    canRetry: false,
    message: 'Sign in to access your content.'
  }
}

/**
 * Check if the session has likely expired based on a failed API response.
 *
 * Call this when an API request returns 401 to determine if the session
 * needs refreshing or if the user needs to re-authenticate.
 */
export function isSessionExpiredResponse(status: number): boolean {
  return status === 401
}

/**
 * Build a recovery action for a given session state.
 */
export function getSessionRecoveryAction(state: SessionState): {
  action: 'login' | 'retry' | 'none'
  path?: string
} {
  switch (state) {
    case 'expired':
    case 'unauthenticated':
      return { action: 'login', path: '/auth/login' }
    case 'offline':
      return { action: 'retry' }
    case 'authenticated':
    case 'unknown':
    default:
      return { action: 'none' }
  }
}
