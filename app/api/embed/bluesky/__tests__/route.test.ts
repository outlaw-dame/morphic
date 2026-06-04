import { afterEach, describe, expect, it, vi } from 'vitest'

import { GET } from '../route'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('Bluesky embed route', () => {
  it('rejects non-Bluesky URLs without fetching upstream', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await GET(
      new Request(
        'http://localhost:3000/api/embed/bluesky?url=https%3A%2F%2Fevil.example%2Fpost'
      )
    )

    expect(response.status).toBe(400)
    expect(await response.text()).toContain('Invalid Bluesky post URL')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('renders sanitized Bluesky embed HTML from oEmbed attributes', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          html: `<blockquote class="bluesky-embed" data-bluesky-uri="at://did:plc:vjug55kidv6sye7ykr5faxxn/app.bsky.feed.post/3jzn6g7ixgq2y" data-bluesky-cid="bafyreiey2tt4dhvuvr7tofatdverqrxmscnnus2uyfcmkacn2fov3vb4wa"><script>alert(1)</script></blockquote><script src="https://evil.example/x.js"></script>`
        }),
        { status: 200 }
      )
    ) as unknown as typeof fetch

    const response = await GET(
      new Request(
        'http://localhost:3000/api/embed/bluesky?url=https%3A%2F%2Fbsky.app%2Fprofile%2Fdid%3Aplc%3Avjug55kidv6sye7ykr5faxxn%2Fpost%2F3jzn6g7ixgq2y'
      )
    )
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('https://embed.bsky.app/static/embed.js')
    expect(html).toContain(
      'data-bluesky-uri="at://did:plc:vjug55kidv6sye7ykr5faxxn/app.bsky.feed.post/3jzn6g7ixgq2y"'
    )
    expect(html).not.toContain('alert(1)')
    expect(html).not.toContain('evil.example')
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'none'"
    )
  })

  it('falls back to a safe link when oEmbed HTML is not trusted', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          html: '<blockquote data-bluesky-uri="javascript:alert(1)"></blockquote>'
        }),
        { status: 200 }
      )
    ) as unknown as typeof fetch

    const response = await GET(
      new Request(
        'http://localhost:3000/api/embed/bluesky?url=https%3A%2F%2Fbsky.app%2Fprofile%2Fdid%3Aplc%3Avjug55kidv6sye7ykr5faxxn%2Fpost%2F3jzn6g7ixgq2y'
      )
    )
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('Open Bluesky post')
    expect(html).not.toContain('javascript:alert')
  })

  it('retries transient oEmbed failures before rendering', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            html: `<blockquote class="bluesky-embed" data-bluesky-uri="at://did:plc:vjug55kidv6sye7ykr5faxxn/app.bsky.feed.post/3jzn6g7ixgq2y" data-bluesky-cid="bafyreiey2tt4dhvuvr7tofatdverqrxmscnnus2uyfcmkacn2fov3vb4wa"></blockquote>`
          }),
          { status: 200 }
        )
      )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await GET(
      new Request(
        'http://localhost:3000/api/embed/bluesky?url=https%3A%2F%2Fbsky.app%2Fprofile%2Fdid%3Aplc%3Avjug55kidv6sye7ykr5faxxn%2Fpost%2F3jzn6g7ixgq2y'
      )
    )

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
