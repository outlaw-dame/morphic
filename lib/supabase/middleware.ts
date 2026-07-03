import { type NextRequest, NextResponse } from 'next/server'

import { createServerClient } from '@supabase/ssr'

import { getSupabasePublishableKey } from './keys'

const MIDDLEWARE_AUTH_TIMEOUT_MS = 4_000

async function getUserWithTimeout(
  getUser: () => Promise<{
    data: { user: unknown }
  }>
) {
  return new Promise<unknown | null>(resolve => {
    const timeout = setTimeout(() => {
      console.warn(
        `[SupabaseMiddleware] auth.getUser timed out after ${MIDDLEWARE_AUTH_TIMEOUT_MS}ms`
      )
      resolve(null)
    }, MIDDLEWARE_AUTH_TIMEOUT_MS)

    getUser().then(
      result => {
        clearTimeout(timeout)
        resolve(result.data.user)
      },
      error => {
        clearTimeout(timeout)
        console.warn('[SupabaseMiddleware] auth.getUser failed', error)
        resolve(null)
      }
    )
  })
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request
  })
  const pathname = request.nextUrl.pathname
  const isPublicPath =
    pathname === '/' ||
    pathname.startsWith('/auth') ||
    pathname === '/discovery' ||
    pathname.startsWith('/search') ||
    pathname.startsWith('/share') ||
    pathname.startsWith('/api')

  if (isPublicPath) {
    return supabaseResponse
  }

  const supabaseKey = getSupabasePublishableKey()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        }
      }
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: DO NOT REMOVE auth.getUser()

  // Define public paths that don't require authentication
  const user = await getUserWithTimeout(() => supabase.auth.getUser())

  // Redirect to login if the user is not authenticated and the path is not public
  if (!user) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
