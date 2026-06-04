import type { SerperSearchResultItem } from '@/lib/types'

export const OWNCAST_DISCOVERY_DOMAINS = [
  'owncast.directory',
  'watch.owncast.online',
  'owncast.fediverse.observer'
]

export function buildOwncastSearchQuery(query: string): string {
  const siteClause = OWNCAST_DISCOVERY_DOMAINS.map(
    domain => `site:${domain}`
  ).join(' OR ')

  return `(${query}) ("Owncast" OR "Powered by Owncast" OR ${siteClause})`
}

export function isLikelyOwncastResult({
  link,
  title = '',
  snippet = '',
  source = '',
  channel = ''
}: Pick<
  SerperSearchResultItem,
  'link' | 'title' | 'snippet' | 'source' | 'channel'
>): boolean {
  try {
    const hostname = new URL(link).hostname.replace(/^www\./, '')
    if (
      hostname.includes('owncast') ||
      OWNCAST_DISCOVERY_DOMAINS.some(
        domain => hostname === domain || hostname.endsWith(`.${domain}`)
      )
    ) {
      return true
    }
  } catch {
    return false
  }

  return `${title} ${snippet} ${source} ${channel}`
    .toLowerCase()
    .includes('owncast')
}
