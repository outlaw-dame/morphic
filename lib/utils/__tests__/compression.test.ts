import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

import {
  compressedJsonResponse,
  isCompressedResponse,
  negotiateEncoding,
  withCompressionHeaders
} from '../compression'

describe('negotiateEncoding', () => {
  it('returns identity when no Accept-Encoding', () => {
    expect(negotiateEncoding(null)).toBe('identity')
    expect(negotiateEncoding('')).toBe('identity')
  })

  it('prefers zstd when client supports it', () => {
    expect(negotiateEncoding('gzip, deflate, br, zstd')).toBe('zstd')
    expect(negotiateEncoding('zstd')).toBe('zstd')
  })

  it('returns gzip when client supports gzip but not zstd', () => {
    expect(negotiateEncoding('gzip, deflate, br')).toBe('gzip')
    expect(negotiateEncoding('gzip')).toBe('gzip')
  })

  it('is case-insensitive', () => {
    expect(negotiateEncoding('GZIP, DEFLATE')).toBe('gzip')
    expect(negotiateEncoding('ZSTD, gzip')).toBe('zstd')
  })

  it('returns identity for unsupported encodings', () => {
    expect(negotiateEncoding('deflate')).toBe('identity')
    expect(negotiateEncoding('br')).toBe('identity')
  })
})

describe('compressedJsonResponse', () => {
  it('returns gzip-compressed response when client accepts gzip', async () => {
    const data = {
      results: Array(100).fill({ title: 'test', content: 'long content here' })
    }
    const request = new Request('http://localhost/api/test', {
      headers: { 'Accept-Encoding': 'gzip, deflate' }
    })

    const response = await compressedJsonResponse(data, request)

    expect(response.headers.get('Content-Encoding')).toBe('gzip')
    expect(response.headers.get('Vary')).toBe('Accept-Encoding')

    // Verify it decompresses to valid JSON
    const compressed = Buffer.from(await response.arrayBuffer())
    const decompressed = gunzipSync(compressed)
    const parsed = JSON.parse(decompressed.toString())
    expect(parsed.results).toHaveLength(100)
  })

  it('returns uncompressed response when no encoding accepted', async () => {
    const data = { hello: 'world' }
    const request = new Request('http://localhost/api/test')

    const response = await compressedJsonResponse(data, request)

    expect(response.headers.get('Content-Encoding')).toBeNull()
    expect(response.headers.get('Content-Type')).toBe('application/json')

    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ hello: 'world' })
  })

  it('sets custom status code', async () => {
    const data = { error: 'not found' }
    const request = new Request('http://localhost/api/test')

    const response = await compressedJsonResponse(data, request, {
      status: 404
    })
    expect(response.status).toBe(404)
  })

  it('sets custom headers', async () => {
    const data = { ok: true }
    const request = new Request('http://localhost/api/test')

    const response = await compressedJsonResponse(data, request, {
      headers: { 'X-Custom': 'value' }
    })
    expect(response.headers.get('X-Custom')).toBe('value')
  })

  it('gzip response is smaller than raw for large payloads', async () => {
    const data = { content: 'a'.repeat(10000) }
    const request = new Request('http://localhost/api/test', {
      headers: { 'Accept-Encoding': 'gzip' }
    })

    const response = await compressedJsonResponse(data, request)
    const compressed = Buffer.from(await response.arrayBuffer())
    const raw = Buffer.from(JSON.stringify(data))

    expect(compressed.length).toBeLessThan(raw.length)
  })
})

describe('withCompressionHeaders', () => {
  it('adds Accept-Encoding header', () => {
    const headers = withCompressionHeaders({
      'Content-Type': 'application/json'
    })
    expect(headers['Accept-Encoding']).toBe('gzip, deflate, br')
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('works with empty headers', () => {
    const headers = withCompressionHeaders()
    expect(headers['Accept-Encoding']).toBe('gzip, deflate, br')
  })
})

describe('isCompressedResponse', () => {
  it('returns true for gzip response', () => {
    const response = new Response('', {
      headers: { 'Content-Encoding': 'gzip' }
    })
    expect(isCompressedResponse(response)).toBe(true)
  })

  it('returns true for zstd response', () => {
    const response = new Response('', {
      headers: { 'Content-Encoding': 'zstd' }
    })
    expect(isCompressedResponse(response)).toBe(true)
  })

  it('returns false for no encoding', () => {
    const response = new Response('')
    expect(isCompressedResponse(response)).toBe(false)
  })

  it('returns false for identity', () => {
    const response = new Response('', {
      headers: { 'Content-Encoding': 'identity' }
    })
    expect(isCompressedResponse(response)).toBe(false)
  })
})
