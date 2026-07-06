import type { SearchResultItem, SearchResults } from '@/lib/types'

import { groundEntities } from './entity-grounding'
import type { KnowledgeGraphEntity, ResolvedEntity } from './entity-types'

export type { EntityMention, KnowledgeGraphEntity, ResolvedEntity } from './entity-types'
export { extractEntityMentions } from './entity-extraction'
export { groundEntities } from './entity-grounding'
export { resolveEntities } from './entity-resolution'

export async function lookupKnowledgeGraphEntities(
  query: string,
  results: SearchResultItem[] = []
): Promise<ResolvedEntity[]> {
  return groundEntities(query, results)
}

export async function enrichSearchResultsWithKnowledgeGraph(
  searchResult: SearchResults
): Promise<SearchResults> {
  const entities = await lookupKnowledgeGraphEntities(
    searchResult.query,
    searchResult.results
  )

  if (entities.length === 0) {
    return searchResult
  }

  return {
    ...searchResult,
    entities: entities satisfies KnowledgeGraphEntity[]
  }
}
