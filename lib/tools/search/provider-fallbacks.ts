import { SearchProviderType } from './providers'

type SearchProviderEnv = Partial<Record<string, string | undefined>>

const SEARXNG_BACKED_PROVIDERS = new Set<SearchProviderType>([
  'qwant',
  'duckduckgo',
  'searxng'
])

const AUTO_FALLBACK_ORDER: SearchProviderType[] = [
  'tavily',
  'brave',
  'kagi',
  'exa',
  'firecrawl'
]

export function isSearXNGBackedProvider(provider: SearchProviderType) {
  return SEARXNG_BACKED_PROVIDERS.has(provider)
}

export function isSearchProviderConfigured(
  provider: SearchProviderType,
  env: SearchProviderEnv = process.env
) {
  switch (provider) {
    case 'qwant':
    case 'duckduckgo':
    case 'searxng':
      return Boolean(env.SEARXNG_API_URL)
    case 'tavily':
      return Boolean(env.TAVILY_API_KEY)
    case 'brave':
      return Boolean(env.BRAVE_SEARCH_API_KEY)
    case 'kagi':
      return Boolean(env.KAGI_SEARCH_API_KEY)
    case 'exa':
      return Boolean(env.EXA_API_KEY)
    case 'firecrawl':
      return Boolean(env.FIRECRAWL_API_KEY)
    default:
      return false
  }
}

export function getSearchProviderFallbackPlan(
  primaryProvider: SearchProviderType,
  env: SearchProviderEnv = process.env
) {
  const explicitFallbacks = parseProviderList(env.SEARCH_API_FALLBACKS)
  const candidates =
    explicitFallbacks.length > 0 ? explicitFallbacks : AUTO_FALLBACK_ORDER
  const primaryUsesSearXNG = isSearXNGBackedProvider(primaryProvider)
  const plan: SearchProviderType[] = []

  for (const provider of candidates) {
    if (provider === primaryProvider) continue
    if (primaryUsesSearXNG && isSearXNGBackedProvider(provider)) continue
    if (!isSearchProviderConfigured(provider, env)) continue
    if (!plan.includes(provider)) {
      plan.push(provider)
    }
  }

  return plan
}

function parseProviderList(value: string | undefined) {
  if (!value) return []

  const providers = new Set<SearchProviderType>([
    'tavily',
    'exa',
    'searxng',
    'firecrawl',
    'brave',
    'qwant',
    'duckduckgo',
    'kagi'
  ])

  return value
    .split(',')
    .map(provider => provider.trim().toLowerCase())
    .filter((provider): provider is SearchProviderType =>
      providers.has(provider as SearchProviderType)
    )
}
