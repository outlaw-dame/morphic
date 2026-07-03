import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  getMistralApiKeyFromCookieStore,
  getMistralNativeWebSearchEnabledFromCookieStore,
  MISTRAL_API_KEY_COOKIE,
  MISTRAL_NATIVE_WEB_SEARCH_ENABLED_COOKIE,
  sanitizeMistralApiKey
} from '@/lib/mistral/api-key'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

function envFlag(name: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(
    String(process.env[name] ?? '')
      .trim()
      .toLowerCase()
  )
}

function getStatus(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const hasUserKey = Boolean(getMistralApiKeyFromCookieStore(cookieStore))
  const hasEnvironmentKey = Boolean(
    sanitizeMistralApiKey(process.env.MISTRAL_API_KEY)
  )
  const userNativeSearch =
    getMistralNativeWebSearchEnabledFromCookieStore(cookieStore)
  const environmentNativeSearch = envFlag('MISTRAL_NATIVE_WEB_SEARCH_ENABLED')

  return {
    ok: true,
    configured: hasUserKey || hasEnvironmentKey,
    source: hasUserKey ? 'user' : hasEnvironmentKey ? 'environment' : 'none',
    nativeWebSearchEnabled:
      userNativeSearch ?? environmentNativeSearch ?? false,
    nativeWebSearchSource:
      userNativeSearch !== undefined
        ? 'user'
        : environmentNativeSearch
          ? 'environment'
          : 'default'
  }
}

export async function GET() {
  const cookieStore = await cookies()
  return NextResponse.json(getStatus(cookieStore))
}

export async function POST(req: Request) {
  let body: unknown

  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid Mistral key payload' },
      { status: 400 }
    )
  }

  const record =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const cookieStore = await cookies()
  const providedApiKey =
    record.apiKey === undefined || record.apiKey === ''
      ? null
      : sanitizeMistralApiKey(record.apiKey)
  if (record.apiKey !== undefined && record.apiKey !== '' && !providedApiKey) {
    return NextResponse.json(
      { ok: false, error: 'Invalid Mistral API key' },
      { status: 400 }
    )
  }

  const existingUserKey = getMistralApiKeyFromCookieStore(cookieStore)
  const environmentKey = sanitizeMistralApiKey(process.env.MISTRAL_API_KEY)
  const apiKey = providedApiKey ?? existingUserKey ?? environmentKey
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'Invalid Mistral API key' },
      { status: 400 }
    )
  }

  const nativeWebSearchEnabled = record.nativeWebSearchEnabled === true
  const source = providedApiKey || existingUserKey ? 'user' : 'environment'

  const response = NextResponse.json({
    ok: true,
    configured: true,
    source,
    nativeWebSearchEnabled,
    nativeWebSearchSource: 'user'
  })

  if (providedApiKey || existingUserKey) {
    response.cookies.set({
      name: MISTRAL_API_KEY_COOKIE,
      value: providedApiKey ?? existingUserKey ?? '',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: COOKIE_MAX_AGE
    })
  }
  response.cookies.set({
    name: MISTRAL_NATIVE_WEB_SEARCH_ENABLED_COOKIE,
    value: nativeWebSearchEnabled ? 'true' : 'false',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE
  })

  return response
}

export async function DELETE() {
  const response = NextResponse.json(
    getStatus({
      get: () => undefined
    } as Awaited<ReturnType<typeof cookies>>)
  )

  response.cookies.set({
    name: MISTRAL_API_KEY_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0
  })
  response.cookies.set({
    name: MISTRAL_NATIVE_WEB_SEARCH_ENABLED_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0
  })

  return response
}
