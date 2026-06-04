export const FEED_SUBSCRIPTIONS_COOKIE = 'morphicFeedSubscriptions'
export const FEED_SUBSCRIPTIONS_MAX_AGE = 60 * 60 * 24 * 365
export const MAX_FEED_SUBSCRIPTIONS = 20

export type FeedSubscription = {
  url: string
  title?: string
}

function cleanTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed ? trimmed.slice(0, 160) : undefined
}

export function normalizeFeedSubscriptionUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const withScheme = /^[a-z][a-z\d+\-.]*:\/\//i.test(value.trim())
    ? value.trim()
    : `https://${value.trim()}`

  try {
    const parsed = new URL(withScheme)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    parsed.hash = ''
    parsed.username = ''
    parsed.password = ''
    return parsed.toString()
  } catch {
    return null
  }
}

export function parseFeedSubscriptionsCookie(
  value: string | undefined
): FeedSubscription[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(decodeURIComponent(value))
    if (!Array.isArray(parsed)) return []

    const seen = new Set<string>()
    const subscriptions: FeedSubscription[] = []

    for (const item of parsed) {
      const url = normalizeFeedSubscriptionUrl(
        typeof item === 'string' ? item : item?.url
      )
      if (!url || seen.has(url)) continue

      seen.add(url)
      subscriptions.push({
        url,
        title: cleanTitle(item?.title)
      })

      if (subscriptions.length >= MAX_FEED_SUBSCRIPTIONS) break
    }

    return subscriptions
  } catch {
    return []
  }
}

export function serializeFeedSubscriptions(
  subscriptions: FeedSubscription[]
): string {
  const seen = new Set<string>()
  const normalized: FeedSubscription[] = []

  for (const subscription of subscriptions) {
    const url = normalizeFeedSubscriptionUrl(subscription.url)
    if (!url || seen.has(url)) continue

    seen.add(url)
    normalized.push({
      url,
      title: cleanTitle(subscription.title)
    })

    if (normalized.length >= MAX_FEED_SUBSCRIPTIONS) break
  }

  return encodeURIComponent(JSON.stringify(normalized))
}
