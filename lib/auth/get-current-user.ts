import { hasSupabasePublicConfig } from '@/lib/supabase/keys'
import { createClient } from '@/lib/supabase/server'
import { perfLog } from '@/lib/utils/perf-logging'
import { incrementAuthCallCount } from '@/lib/utils/perf-tracking'

const AUTH_LOOKUP_TIMEOUT_MS = 5_000

function timeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      console.warn(`[Auth] Supabase user lookup timed out after ${timeoutMs}ms`)
      resolve(null)
    }, timeoutMs)

    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        console.warn('[Auth] Supabase user lookup failed', error)
        resolve(null)
      }
    )
  })
}

export async function getCurrentUser() {
  if (!hasSupabasePublicConfig()) {
    return null // Supabase is not configured
  }

  const supabase = await createClient()
  const result = await timeout(supabase.auth.getUser(), AUTH_LOOKUP_TIMEOUT_MS)
  return result?.data.user ?? null
}

export async function getCurrentUserId() {
  const count = incrementAuthCallCount()
  perfLog(`getCurrentUserId called - count: ${count}`)

  // Skip authentication mode (for personal Docker deployments)
  if (process.env.ENABLE_AUTH === 'false') {
    // Guard: Prevent disabling auth in Morphic Cloud deployments
    if (process.env.MORPHIC_CLOUD_DEPLOYMENT === 'true') {
      throw new Error(
        'ENABLE_AUTH=false is not allowed in MORPHIC_CLOUD_DEPLOYMENT'
      )
    }

    // Always warn when authentication is disabled (except in tests)
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '⚠️  Authentication disabled. Running in anonymous mode.\n' +
          '   All users share the same user ID. For personal use only.'
      )
    }

    return process.env.ANONYMOUS_USER_ID || 'anonymous-user'
  }

  const user = await getCurrentUser()
  return user?.id
}
