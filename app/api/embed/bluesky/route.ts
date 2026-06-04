import { NextResponse } from 'next/server'

import { retryWithBackoff } from '@/lib/utils/retry'

const BLUESKY_OEMBED_ENDPOINT = 'https://embed.bsky.app/oembed'
const MAX_OEMBED_HTML_LENGTH = 50_000
const MAX_WIDTH = 600
const MIN_WIDTH = 220

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function parseBlueskyPostUrl(raw: string): URL | undefined {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.hostname !== 'bsky.app') {
      return undefined
    }
    if (url.username || url.password) return undefined
    if (!/^\/profile\/[^/]+\/post\/[^/]+\/?$/.test(url.pathname)) {
      return undefined
    }
    url.search = ''
    url.hash = ''
    return url
  } catch {
    return undefined
  }
}

function clampMaxWidth(raw: string | null) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return MAX_WIDTH
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.floor(parsed)))
}

function extractBlueskyEmbedAttributes(html: string) {
  if (html.length > MAX_OEMBED_HTML_LENGTH) return undefined

  const uri = html.match(/\sdata-bluesky-uri="([^"]+)"/)?.[1]
  const cid = html.match(/\sdata-bluesky-cid="([^"]+)"/)?.[1]

  if (
    !uri ||
    !cid ||
    !/^at:\/\/did:plc:[a-z0-9]+\/app\.bsky\.feed\.post\/[a-z0-9]+$/i.test(
      uri
    ) ||
    !/^bafy[a-z0-9]+$/i.test(cid)
  ) {
    return undefined
  }

  return { uri, cid }
}

function renderFallbackDocument(url: URL) {
  const href = escapeHtml(url.toString())
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fff;color:#111}
a{display:flex;min-height:160px;align-items:center;justify-content:center;padding:16px;color:#0a7cff;text-align:center}
</style>
</head>
<body><a href="${href}" target="_blank" rel="noopener noreferrer">Open Bluesky post</a></body>
</html>`
}

function renderBlueskyDocument(url: URL, uri: string, cid: string) {
  const href = escapeHtml(url.toString())
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;background:transparent;color-scheme:light dark}
.bluesky-embed{max-width:100%;margin:0}
</style>
</head>
<body>
<blockquote class="bluesky-embed" data-bluesky-uri="${escapeHtml(uri)}" data-bluesky-cid="${escapeHtml(cid)}">
<a href="${href}" target="_blank" rel="noopener noreferrer">View on Bluesky</a>
</blockquote>
<script async src="https://embed.bsky.app/static/embed.js" charset="utf-8"></script>
</body>
</html>`
}

function htmlResponse(html: string, status: number = 200) {
  return new NextResponse(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': [
        "default-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'self'",
        'img-src https: data:',
        "style-src 'unsafe-inline'",
        'script-src https://embed.bsky.app',
        'connect-src https://embed.bsky.app https://public.api.bsky.app https://bsky.social https://api.bsky.app',
        'frame-src https://embed.bsky.app https://bsky.app'
      ].join('; ')
    }
  })
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const postUrl = parseBlueskyPostUrl(requestUrl.searchParams.get('url') ?? '')

  if (!postUrl) {
    return htmlResponse('Invalid Bluesky post URL', 400)
  }

  const maxwidth = clampMaxWidth(requestUrl.searchParams.get('maxwidth'))
  const endpoint = new URL(BLUESKY_OEMBED_ENDPOINT)
  endpoint.searchParams.set('url', postUrl.toString())
  endpoint.searchParams.set('maxwidth', String(maxwidth))

  try {
    const response = await retryWithBackoff(
      () =>
        fetch(endpoint.toString(), {
          headers: { Accept: 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(5_000)
        }),
      {
        maxRetries: 2,
        initialDelayMs: 150,
        maxDelayMs: 1_000,
        onRetry: error => {
          const message =
            error instanceof Error ? error.message : 'unknown oEmbed error'
          console.warn(
            `[BlueskyEmbed] retrying failed oEmbed fetch: ${message}`
          )
        }
      }
    )

    if (!response.ok) {
      return htmlResponse(renderFallbackDocument(postUrl), response.status)
    }

    const payload = (await response.json()) as { html?: unknown }
    if (typeof payload.html !== 'string') {
      return htmlResponse(renderFallbackDocument(postUrl))
    }

    const attrs = extractBlueskyEmbedAttributes(payload.html)
    if (!attrs) {
      return htmlResponse(renderFallbackDocument(postUrl))
    }

    return htmlResponse(renderBlueskyDocument(postUrl, attrs.uri, attrs.cid))
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'unknown oEmbed error'
    console.warn(`[BlueskyEmbed] using fallback document: ${message}`)
    return htmlResponse(renderFallbackDocument(postUrl))
  }
}
