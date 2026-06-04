import type { SearchResultItem } from '@/lib/types'

export type CommunitySource = {
  label: string
  domains: string[]
}

export const COMMUNITY_SOURCES: CommunitySource[] = [
  {
    label: 'PieFed',
    domains: ['piefed.world', 'piefed.ca', 'piefed.social']
  },
  {
    label: 'Lemmy',
    domains: [
      'lemmy.world',
      'lemmy.ml',
      'lemm.ee',
      'beehaw.org',
      'sh.itjust.works',
      'programming.dev',
      'discuss.tchncs.de',
      'sopuli.xyz'
    ]
  },
  {
    label: 'Mbin',
    domains: ['fedia.io', 'kbin.earth', 'moist.catsweat.com']
  },
  {
    label: 'Tildes',
    domains: ['tildes.net']
  },
  {
    label: 'NodeBB',
    domains: ['community.nodebb.org']
  },
  {
    label: 'Discourse',
    domains: [
      'meta.discourse.org',
      'discuss.python.org',
      'discourse.mozilla.org',
      'discourse.ubuntu.com',
      'community.openai.com'
    ]
  }
]

const COMMUNITY_DOMAIN_TO_LABEL = new Map(
  COMMUNITY_SOURCES.flatMap(source =>
    source.domains.map(domain => [domain, source.label] as const)
  )
)

export const COMMUNITY_SOURCE_DOMAINS = COMMUNITY_SOURCES.flatMap(
  source => source.domains
)

export function buildCommunitySearchQuery(query: string): string {
  const siteClause = COMMUNITY_SOURCE_DOMAINS.map(
    domain => `site:${domain}`
  ).join(' OR ')
  return `(${query}) (${siteClause})`
}

export function identifyCommunitySource(url: string): string | undefined {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    for (const [domain, label] of COMMUNITY_DOMAIN_TO_LABEL.entries()) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return label
      }
    }
  } catch {
    return undefined
  }
}

export function tagCommunityResult(result: SearchResultItem): SearchResultItem {
  return {
    ...result,
    sourceType: 'community',
    communitySource: identifyCommunitySource(result.url)
  }
}
