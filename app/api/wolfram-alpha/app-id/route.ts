import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  getWolframAlphaAppIdStatus,
  normalizeWolframAlphaAppId,
  WOLFRAM_ALPHA_APP_ID_COOKIE,
  WOLFRAM_ALPHA_APP_ID_MAX_AGE
} from '@/lib/config/wolfram-alpha'

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: WOLFRAM_ALPHA_APP_ID_MAX_AGE
  }
}

async function getUserAppIdFromCookie() {
  const cookieStore = await cookies()
  return normalizeWolframAlphaAppId(
    cookieStore.get(WOLFRAM_ALPHA_APP_ID_COOKIE)?.value
  )
}

export async function GET() {
  return NextResponse.json(
    getWolframAlphaAppIdStatus(await getUserAppIdFromCookie())
  )
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const appId = normalizeWolframAlphaAppId(body?.appId)

  if (!appId) {
    return NextResponse.json(
      {
        error:
          'Enter a valid Wolfram|Alpha AppID using letters, numbers, hyphens, or underscores.'
      },
      { status: 400 }
    )
  }

  const response = NextResponse.json(getWolframAlphaAppIdStatus(appId))
  response.cookies.set(WOLFRAM_ALPHA_APP_ID_COOKIE, appId, cookieOptions())
  return response
}

export async function DELETE() {
  const response = NextResponse.json(getWolframAlphaAppIdStatus(null))
  response.cookies.delete(WOLFRAM_ALPHA_APP_ID_COOKIE)
  return response
}
