import type { KnowledgeGraphEntity } from './entity-types'
import { fetchEntityJson } from './entity-fetch'
import { normalizeWhitespace } from './entity-extraction'

const MAX_ENTITY_RESULTS_PER_QUERY = 2

function wikidataHits(json: Record<string, unknown> | null): unknown[] {
  return Array.isArray(json?.search) ? json.search : []
}

export async function searchWikidata(
  query: string
): Promise<KnowledgeGraphEntity[]> {
  const url = new URL('https://www.wikidata.org/w/api.php')
  url.searchParams.set('action', 'wbsearchentities')
  url.searchParams.set('search', query)
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', String(MAX_ENTITY_RESULTS_PER_QUERY))

  const json = await fetchEntityJson(url.toString())
  const entities: KnowledgeGraphEntity[] = []

  for (const hit of wikidataHits(json)) {
    const record = hit as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id : undefined
    const label = normalizeWhitespace(String(record.label ?? ''))
    if (!id || !label) continue

    entities.push({
      label,
      description:
        normalizeWhitespace(String(record.description ?? '')) || undefined,
      matchedText: query,
      wikidataId: id,
      wikidataUrl: `https://www.wikidata.org/wiki/${encodeURIComponent(id)}`,
      source: 'wikidata',
      confidence: Number(record.score ?? 0.8) || 0.8
    })
  }

  return entities
}
