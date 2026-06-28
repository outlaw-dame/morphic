import { describe, expect, it } from 'vitest'

import {
  getSearchProviderFallbackPlan,
  isSearchProviderConfigured
} from '../provider-fallbacks'

describe('search provider fallbacks', () => {
  it('does not retry SearXNG-backed providers when the primary depends on SearXNG', () => {
    const plan = getSearchProviderFallbackPlan('qwant', {
      SEARXNG_API_URL: 'http://localhost:8080',
      SEARCH_API_FALLBACKS: 'duckduckgo,searxng,tavily',
      TAVILY_API_KEY: 'configured'
    })

    expect(plan).toEqual(['tavily'])
  })

  it('uses only configured providers from explicit fallback order', () => {
    const plan = getSearchProviderFallbackPlan('qwant', {
      SEARCH_API_FALLBACKS: 'brave,tavily,kagi',
      TAVILY_API_KEY: 'configured'
    })

    expect(plan).toEqual(['tavily'])
  })

  it('builds an automatic keyed-provider fallback plan when no explicit list is set', () => {
    const plan = getSearchProviderFallbackPlan('qwant', {
      TAVILY_API_KEY: 'configured',
      BRAVE_SEARCH_API_KEY: 'configured'
    })

    expect(plan).toEqual(['tavily', 'brave'])
  })

  it('knows provider configuration requirements', () => {
    expect(
      isSearchProviderConfigured('qwant', {
        SEARXNG_API_URL: 'http://localhost:8080'
      })
    ).toBe(true)
    expect(isSearchProviderConfigured('qwant', {})).toBe(false)
    expect(
      isSearchProviderConfigured('brave', {
        BRAVE_SEARCH_API_KEY: 'configured'
      })
    ).toBe(true)
  })
})
