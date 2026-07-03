import { describe, expect, it } from 'vitest'

import {
  appendMistralServerToolsToRequest,
  buildMistralServerToolHeaders,
  createMistralServerToolsProviderOptions,
  createMistralServerToolsProviderOptionsForUser,
  decodeMistralServerToolsHeader,
  hasMistralNativeWebSearchEnabled,
  MISTRAL_SERVER_TOOLS_HEADER,
  MISTRAL_SOURCE_FIRST_NATIVE_SEARCH_GUIDANCE,
  sanitizeMistralServerToolsConfig
} from '../mistral-server-tools'

describe('Mistral server tools adapter', () => {
  it('omits native tools for non-Mistral providers', () => {
    const headers = buildMistralServerToolHeaders('openai', {
      mistral: {
        serverTools: {
          enabled: true,
          webSearch: {
            enabled: true,
            tool: 'web_search'
          }
        }
      }
    })

    expect(headers).toEqual({})
  })

  it('validates and encodes native web search for Mistral', () => {
    const headers = buildMistralServerToolHeaders('mistral', {
      mistral: {
        serverTools: {
          enabled: true,
          webSearch: {
            enabled: true,
            tool: 'web_search',
            maxRetries: 2,
            timeoutMs: 8000
          }
        }
      }
    })

    expect(headers[MISTRAL_SERVER_TOOLS_HEADER]).toBeTruthy()
    expect(
      decodeMistralServerToolsHeader(headers[MISTRAL_SERVER_TOOLS_HEADER]!)
    ).toEqual({
      enabled: true,
      webSearch: {
        enabled: true,
        tool: 'web_search',
        maxRetries: 2,
        timeoutMs: 8000
      }
    })
  })

  it('fails closed when premium web search is not explicitly allowed', () => {
    const config = sanitizeMistralServerToolsConfig({
      enabled: true,
      webSearch: {
        enabled: true,
        tool: 'web_search_premium'
      }
    })

    expect(config).toBeNull()
  })

  it('allows premium web search only with a separate premium opt-in', () => {
    const config = sanitizeMistralServerToolsConfig({
      enabled: true,
      webSearch: {
        enabled: true,
        tool: 'web_search_premium',
        premiumEnabled: true
      }
    })

    expect(config).toEqual({
      enabled: true,
      webSearch: {
        enabled: true,
        tool: 'web_search_premium',
        premiumEnabled: true
      }
    })
  })

  it('creates empty provider options when disabled or invalid', () => {
    expect(
      createMistralServerToolsProviderOptions({
        enabled: false,
        webSearch: {
          enabled: true,
          tool: 'web_search'
        }
      })
    ).toEqual({})

    expect(
      createMistralServerToolsProviderOptions({
        enabled: true,
        webSearch: {
          enabled: true,
          tool: 'web_search_premium'
        }
      })
    ).toEqual({})
  })

  it('creates standard native web-search provider options for user preference', () => {
    process.env.MISTRAL_NATIVE_WEB_SEARCH_TOOL = 'web_search_premium'
    process.env.MISTRAL_NATIVE_WEB_SEARCH_PREMIUM_ENABLED = 'true'

    expect(createMistralServerToolsProviderOptionsForUser(true)).toEqual({
      mistral: {
        serverTools: {
          enabled: true,
          webSearch: {
            enabled: true,
            tool: 'web_search'
          }
        }
      }
    })
    expect(createMistralServerToolsProviderOptionsForUser(false)).toEqual({})

    delete process.env.MISTRAL_NATIVE_WEB_SEARCH_TOOL
    delete process.env.MISTRAL_NATIVE_WEB_SEARCH_PREMIUM_ENABLED
  })

  it('appends validated Mistral native web search to the outgoing request body', () => {
    const providerOptions = createMistralServerToolsProviderOptions({
      enabled: true,
      webSearch: {
        enabled: true,
        tool: 'web_search'
      }
    })
    const headers = new Headers(
      buildMistralServerToolHeaders('mistral', providerOptions)
    )
    const body = JSON.stringify({
      model: 'mistral-large-latest',
      messages: [],
      tools: [
        {
          type: 'function',
          function: {
            name: 'search',
            parameters: { type: 'object' }
          }
        }
      ]
    })

    const updated = appendMistralServerToolsToRequest(body, headers)

    expect(headers.has(MISTRAL_SERVER_TOOLS_HEADER)).toBe(false)
    if (typeof updated !== 'string') {
      throw new Error('Expected Mistral request body to remain a string')
    }
    expect(JSON.parse(updated)).toEqual({
      model: 'mistral-large-latest',
      messages: [],
      tools: [
        {
          type: 'function',
          function: {
            name: 'search',
            parameters: { type: 'object' }
          }
        },
        {
          type: 'web_search'
        }
      ]
    })
  })

  it('detects Mistral native web search only after provider-scoped validation', () => {
    const providerOptions = createMistralServerToolsProviderOptions({
      enabled: true,
      webSearch: {
        enabled: true,
        tool: 'web_search'
      }
    })

    expect(hasMistralNativeWebSearchEnabled('mistral', providerOptions)).toBe(
      true
    )
    expect(hasMistralNativeWebSearchEnabled('openai', providerOptions)).toBe(
      false
    )
    expect(
      hasMistralNativeWebSearchEnabled('mistral', {
        mistral: {
          serverTools: {
            enabled: true,
            webSearch: {
              enabled: true,
              tool: 'web_search_premium'
            }
          }
        }
      })
    ).toBe(false)
  })

  it('documents that native search is supplemental to the source-first pipeline', () => {
    expect(MISTRAL_SOURCE_FIRST_NATIVE_SEARCH_GUIDANCE).toContain(
      'supplemental cross-check path'
    )
    expect(MISTRAL_SOURCE_FIRST_NATIVE_SEARCH_GUIDANCE).toContain(
      'app source pipeline'
    )
  })
})
