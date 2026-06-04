import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  FEED_SUBSCRIPTIONS_COOKIE,
  FEED_SUBSCRIPTIONS_MAX_AGE,
  MAX_FEED_SUBSCRIPTIONS,
  normalizeFeedSubscriptionUrl,
  parseFeedSubscriptionsCookie,
  serializeFeedSubscriptions
} from '@/lib/config/feed-subscriptions'
import { validateOutboundUrl } from '@/lib/utils/ssrf-guard'

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: FEED_SUBSCRIPTIONS_MAX_AGE
  }
}

async function getSubscriptions() {
  const cookieStore = await cookies()
  return parseFeedSubscriptionsCookie(
    cookieStore.get(FEED_SUBSCRIPTIONS_COOKIE)?.value
  )
}

function jsonWithSubscriptions(subscriptions: Awaited<ReturnType<typeof getSubscriptions>>) {
  return NextResponse.json({
    feeds: subscriptions,
    maxFeeds: MAX_FEED_SUBSCRIPTIONS
  })
}

export async function GET() {
  return jsonWithSubscriptions(await getSubscriptions())
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const url = normalizeFeedSubscriptionUrl(body?.url)

  if (!url) {
    return NextResponse.json(
      { error: 'Enter a valid HTTP or HTTPS feed URL.' },
      { status: 400 }
    )
  }

  try {
    await validateOutboundUrl(url)
  } catch {
    return NextResponse.json(
      { error: 'That feed URL cannot be fetched safely.' },
      { status: 400 }
    )
  }

  const subscriptions = await getSubscriptions()
  const title =
    typeof body?.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, 160)
      : undefined

  const nextSubscriptions = [
    { url, title },
    ...subscriptions.filter(subscription => subscription.url !== url)
  ].slice(0, MAX_FEED_SUBSCRIPTIONS)

  const response = jsonWithSubscriptions(nextSubscriptions)
  response.cookies.set(
    FEED_SUBSCRIPTIONS_COOKIE,
    serializeFeedSubscriptions(nextSubscriptions),
    cookieOptions()
  )
  return response
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null)
  const url = normalizeFeedSubscriptionUrl(body?.url)
  const subscriptions = await getSubscriptions()

  const nextSubscriptions = url
    ? subscriptions.filter(subscription => subscription.url !== url)
    : []

  const response = jsonWithSubscriptions(nextSubscriptions)

  if (nextSubscriptions.length) {
    response.cookies.set(
      FEED_SUBSCRIPTIONS_COOKIE,
      serializeFeedSubscriptions(nextSubscriptions),
      cookieOptions()
    )
  } else {
    response.cookies.delete(FEED_SUBSCRIPTIONS_COOKIE)
  }

  return response
}
