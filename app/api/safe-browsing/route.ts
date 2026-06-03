import { NextResponse } from 'next/server'

const GOOGLE_SAFE_BROWSING_ENDPOINT =
  'https://safebrowsing.googleapis.com/v4/threatMatches:find'

const SAFE_BROWSING_THREAT_TYPES = [
  'MALWARE',
  'SOCIAL_ENGINEERING',
  'UNWANTED_SOFTWARE',
  'POTENTIALLY_HARMFUL_APPLICATION'
]

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (value.length > 2048) return null

  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    url?: unknown
  } | null

  const url = normalizeUrl(body?.url)
  if (!url) {
    return NextResponse.json(
      {
        safe: true,
        checked: false,
        threatTypes: [],
        reason: 'invalid_url'
      },
      { status: 400 }
    )
  }

  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({
      safe: true,
      checked: false,
      threatTypes: [],
      reason: 'not_configured'
    })
  }

  const payload = {
    client: {
      clientId: 'morphic',
      clientVersion: process.env.npm_package_version || '0.0.0'
    },
    threatInfo: {
      threatTypes: SAFE_BROWSING_THREAT_TYPES,
      platformTypes: ['ANY_PLATFORM'],
      threatEntryTypes: ['URL'],
      threatEntries: [{ url }]
    }
  }

  try {
    const upstream = await fetch(
      `${GOOGLE_SAFE_BROWSING_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: AbortSignal.timeout(8_000)
      }
    )

    const data = (await upstream.json().catch(() => ({}))) as {
      matches?: Array<{ threatType?: unknown }>
    }

    if (!upstream.ok) {
      return NextResponse.json({
        safe: true,
        checked: false,
        threatTypes: [],
        reason: 'upstream_error'
      })
    }

    const threatTypes = Array.isArray(data.matches)
      ? data.matches
          .map(match =>
            typeof match.threatType === 'string'
              ? match.threatType
              : 'UNKNOWN'
          )
          .slice(0, 8)
      : []

    return NextResponse.json({
      safe: threatTypes.length === 0,
      checked: true,
      threatTypes
    })
  } catch {
    return NextResponse.json({
      safe: true,
      checked: false,
      threatTypes: [],
      reason: 'upstream_error'
    })
  }
}
