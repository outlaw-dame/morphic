/**
 * HTTP Response compression utilities.
 *
 * Supports:
 * - Zstandard (zstd) — modern, fast, best compression ratio
 * - Gzip — universal fallback, supported everywhere
 *
 * Usage:
 *   import { compressedJsonResponse } from '@/lib/utils/compression'
 *   return compressedJsonResponse(data, request)
 *
 * The module negotiates the best encoding based on the request's
 * Accept-Encoding header. Zstd is preferred when available.
 *
 * For streaming responses (SSE), use `compressedStreamResponse`.
 */

import { gzipSync } from 'node:zlib'

type SupportedEncoding = 'zstd' | 'gzip' | 'identity'

/**
 * Attempt to load zstd-napi. Returns null if unavailable (e.g., Vercel edge).
 */
let zstdCompress: ((input: Buffer) => Buffer) | null = null
let zstdInitialized = false

async function getZstdCompress(): Promise<((input: Buffer) => Buffer) | null> {
  if (zstdInitialized) return zstdCompress
  zstdInitialized = true

  try {
    const { compress } = await import('zstd-napi')
    zstdCompress = (input: Buffer) => compress(input, { compressionLevel: 3 })
    return zstdCompress
  } catch {
    // zstd-napi not available (edge runtime, missing native binary)
    return null
  }
}

/**
 * Parse Accept-Encoding header and determine best supported encoding.
 */
export function negotiateEncoding(
  acceptEncoding: string | null
): SupportedEncoding {
  if (!acceptEncoding) return 'identity'

  const lower = acceptEncoding.toLowerCase()

  // Prefer zstd when client supports it (modern browsers + HTTP/3)
  if (lower.includes('zstd')) return 'zstd'
  if (lower.includes('gzip')) return 'gzip'

  return 'identity'
}

/**
 * Compress a JSON response with the best available encoding.
 *
 * Negotiates encoding from the request's Accept-Encoding header.
 * Falls back gracefully: zstd → gzip → identity (uncompressed).
 */
export async function compressedJsonResponse(
  data: unknown,
  request: Request,
  options?: { status?: number; headers?: Record<string, string> }
): Promise<Response> {
  const acceptEncoding = request.headers.get('accept-encoding')
  const preferredEncoding = negotiateEncoding(acceptEncoding)
  const jsonString = JSON.stringify(data)
  const inputBuffer = Buffer.from(jsonString, 'utf-8')

  const responseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Vary: 'Accept-Encoding',
    ...options?.headers
  }

  // Try zstd first
  if (preferredEncoding === 'zstd') {
    const compress = await getZstdCompress()
    if (compress) {
      try {
        const compressed = compress(inputBuffer)
        responseHeaders['Content-Encoding'] = 'zstd'
        responseHeaders['Content-Length'] = String(compressed.length)
        return new Response(new Uint8Array(compressed), {
          status: options?.status ?? 200,
          headers: responseHeaders
        })
      } catch {
        // Fall through to gzip
      }
    }
    // zstd unavailable — fall through to gzip if client also accepts it
    if (acceptEncoding?.toLowerCase().includes('gzip')) {
      return gzipResponse(inputBuffer, responseHeaders, options?.status)
    }
  }

  // Gzip
  if (preferredEncoding === 'gzip') {
    return gzipResponse(inputBuffer, responseHeaders, options?.status)
  }

  // Identity (no compression)
  responseHeaders['Content-Length'] = String(inputBuffer.length)
  return new Response(jsonString, {
    status: options?.status ?? 200,
    headers: responseHeaders
  })
}

function gzipResponse(
  input: Buffer,
  headers: Record<string, string>,
  status?: number
): Response {
  const compressed = gzipSync(input, { level: 6 })
  headers['Content-Encoding'] = 'gzip'
  headers['Content-Length'] = String(compressed.length)
  return new Response(new Uint8Array(compressed), {
    status: status ?? 200,
    headers
  })
}

/**
 * Add Accept-Encoding header to outbound fetch requests.
 *
 * Call this when making requests to external APIs that may support
 * compressed responses.
 */
export function withCompressionHeaders(
  headers: Record<string, string> = {}
): Record<string, string> {
  return {
    ...headers,
    'Accept-Encoding': 'gzip, deflate, br, zstd'
  }
}

/**
 * Check if a response is compressed and the runtime can handle it.
 *
 * Node.js/Bun fetch() automatically decompresses gzip/br responses,
 * so this is primarily informational.
 */
export function isCompressedResponse(response: Response): boolean {
  const encoding = response.headers.get('content-encoding')
  return encoding !== null && encoding !== 'identity'
}
