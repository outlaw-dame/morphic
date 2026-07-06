export type EntityMentionSource = 'query' | 'result_title' | 'result_content'

export type EntityMention = {
  text: string
  normalizedText: string
  source: EntityMentionSource
  resultIndex?: number
  confidence: number
}

export interface KnowledgeGraphEntity {
  label: string
  description?: string
  matchedText: string
  wikidataId?: string
  wikidataUrl?: string
  dbpediaUri?: string
  dbpediaUrl?: string
  source: 'wikidata' | 'dbpedia' | 'both'
  confidence: number
}

export type ResolvedEntity = KnowledgeGraphEntity & {
  canonicalName: string
  canonicalUrl?: string
  aliases: string[]
  supportingMentions: EntityMention[]
  ambiguous: boolean
  ambiguityReasons: string[]
}

export type EntityLookupClient = (
  query: string
) => Promise<KnowledgeGraphEntity[]>

export type EntityGroundingClients = {
  wikidata?: EntityLookupClient
  dbpedia?: EntityLookupClient
}

export type EntityGroundingOptions = {
  clients?: EntityGroundingClients
  maxMentions?: number
  maxResolvedEntities?: number
}
