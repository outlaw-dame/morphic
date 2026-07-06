import type { SearchResultItem } from '@/lib/types'

import { searchDbpedia } from './dbpedia-client'
import { extractEntityMentions } from './entity-extraction'
import { resolveEntities } from './entity-resolution'
import type {
  EntityGroundingOptions,
  EntityLookupClient,
  ResolvedEntity
} from './entity-types'
import { searchWikidata } from './wikidata-client'

const DEFAULT_MAX_MENTIONS = 6
const DEFAULT_MAX_RESOLVED_ENTITIES = 6

async function lookupMention(
  query: string,
  wikidata: EntityLookupClient,
  dbpedia: EntityLookupClient
) {
  const [wikidataEntities, dbpediaEntities] = await Promise.all([
    wikidata(query),
    dbpedia(query)
  ])

  return [...wikidataEntities, ...dbpediaEntities]
}

export async function groundEntities(
  query: string,
  results: SearchResultItem[] = [],
  options: EntityGroundingOptions = {}
): Promise<ResolvedEntity[]> {
  const maxMentions = options.maxMentions ?? DEFAULT_MAX_MENTIONS
  const maxResolvedEntities =
    options.maxResolvedEntities ?? DEFAULT_MAX_RESOLVED_ENTITIES
  const mentions = extractEntityMentions(query, results, maxMentions)

  if (mentions.length === 0) {
    return []
  }

  const wikidata = options.clients?.wikidata ?? searchWikidata
  const dbpedia = options.clients?.dbpedia ?? searchDbpedia
  const batches = await Promise.all(
    mentions.map(mention =>
      lookupMention(mention.normalizedText, wikidata, dbpedia)
    )
  )

  return resolveEntities(mentions, batches.flat(), maxResolvedEntities)
}
