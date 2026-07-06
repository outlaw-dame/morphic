import { normalizeWhitespace } from './entity-extraction'
import { fetchEntityJson } from './entity-fetch'
import type { KnowledgeGraphEntity } from './entity-types'

const MAX_ENTITY_RESULTS_PER_QUERY = 2

function firstString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined
  }
  return typeof value === 'string' ? value : undefined
}

function dbpediaDocs(json: Record<string, unknown> | null): unknown[] {
  if (Array.isArray(json?.docs)) return json.docs
  if (Array.isArray(json?.results)) return json.results
  return []
}

export async function searchDbpedia(
  query: string
): Promise<KnowledgeGraphEntity[]> {
  const url = new URL('https://lookup.dbpedia.org/api/search')
  url.searchParams.set('query', query)
  url.searchParams.set('format', 'JSON')
  url.searchParams.set('maxResults', String(MAX_ENTITY_RESULTS_PER_QUERY))

  const json = await fetchEntityJson(url.toString())
  const entities: KnowledgeGraphEntity[] = []

  for (const doc of dbpediaDocs(json)) {
    const record = doc as Record<string, unknown>
    const uri = firstString(record.resource) || firstString(record.uri)
    const label =
      normalizeWhitespace(
        firstString(record.label) || String(record.label ?? '')
      ) || (uri ? decodeURIComponent(uri.split('/').pop() || '') : '')
    if (!uri || !label) continue

    const description =
      normalizeWhitespace(
        firstString(record.comment) || firstString(record.description) || ''
      ) || undefined

    entities.push({
      label,
      description,
      matchedText: query,
      dbpediaUri: uri,
      dbpediaUrl: uri.replace(/^http:/, 'https:'),
      source: 'dbpedia',
      confidence:
        Number(firstString(record.score) ?? record.score ?? 0.65) || 0.65
    })
  }

  return entities
}
