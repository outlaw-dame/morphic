import { describe, expect, it } from 'vitest'

import { extractEntityMentions } from './entity-extraction'
import { groundEntities } from './entity-grounding'
import { resolveEntities } from './entity-resolution'
import type { EntityMention, KnowledgeGraphEntity } from './entity-types'

describe('entity grounding', () => {
  it('extracts deterministic query and result entity mentions', () => {
    const mentions = extractEntityMentions('Who is Michael Jordan?', [
      {
        title: 'Michael Jordan - Wikipedia',
        url: 'https://en.wikipedia.org/wiki/Michael_Jordan',
        content:
          'Michael Jeffrey Jordan is an American businessman and former basketball player.'
      },
      {
        title: 'Jordan Brand official website',
        url: 'https://www.nike.com/jordan',
        content: 'Jordan Brand sells shoes and apparel.'
      }
    ])

    expect(mentions[0]).toMatchObject({
      normalizedText: 'Michael Jordan',
      source: 'query',
      confidence: 1
    })
    expect(mentions.map(mention => mention.normalizedText)).toContain(
      'Michael Jordan'
    )
    expect(mentions.length).toBeLessThanOrEqual(6)
  })

  it('skips malformed result entity fields without throwing', () => {
    const mentions = extractEntityMentions('Cape Verde', [
      {
        title: undefined as unknown as string,
        url: 'https://example.com/malformed',
        content: null as unknown as string
      },
      {
        title: 'Boa Vista travel guide',
        url: 'https://example.com/boa-vista',
        content: 'Boa Vista is one of the Cape Verde islands.'
      }
    ])

    expect(mentions.map(mention => mention.normalizedText)).toContain(
      'Cape Verde'
    )
    expect(mentions.map(mention => mention.normalizedText)).toContain(
      'Boa Vista'
    )
  })

  it('merges Wikidata and DBpedia entities into one canonical resolved entity', () => {
    const mentions: EntityMention[] = [
      {
        text: 'Michael Jordan',
        normalizedText: 'Michael Jordan',
        source: 'query',
        confidence: 1
      }
    ]

    const entities: KnowledgeGraphEntity[] = [
      {
        label: 'Michael Jordan',
        description: 'American basketball player and businessman',
        matchedText: 'Michael Jordan',
        wikidataId: 'Q41421',
        wikidataUrl: 'https://www.wikidata.org/wiki/Q41421',
        source: 'wikidata',
        confidence: 0.9
      },
      {
        label: 'Michael Jordan',
        matchedText: 'Michael Jordan',
        dbpediaUri: 'http://dbpedia.org/resource/Michael_Jordan',
        dbpediaUrl: 'https://dbpedia.org/resource/Michael_Jordan',
        source: 'dbpedia',
        confidence: 0.7
      }
    ]

    const resolved = resolveEntities(mentions, entities)

    expect(resolved).toHaveLength(1)
    expect(resolved[0]).toMatchObject({
      canonicalName: 'Michael Jordan',
      source: 'both',
      wikidataId: 'Q41421',
      dbpediaUri: 'http://dbpedia.org/resource/Michael_Jordan',
      ambiguous: false
    })
    expect(resolved[0].confidence).toBeGreaterThan(0.9)
  })

  it('flags same-label entities with different canonical IDs as ambiguous', () => {
    const mentions: EntityMention[] = [
      {
        text: 'Apple',
        normalizedText: 'Apple',
        source: 'query',
        confidence: 1
      }
    ]

    const resolved = resolveEntities(mentions, [
      {
        label: 'Apple',
        description: 'technology company',
        matchedText: 'Apple',
        wikidataId: 'Q312',
        source: 'wikidata',
        confidence: 0.86
      },
      {
        label: 'Apple',
        description: 'edible fruit',
        matchedText: 'Apple',
        wikidataId: 'Q89',
        source: 'wikidata',
        confidence: 0.83
      }
    ])

    expect(resolved).toHaveLength(2)
    expect(resolved.every(entity => entity.ambiguous)).toBe(true)
    expect(resolved[0].ambiguityReasons).toContain(
      'same_label_multiple_canonical_entities'
    )
  })

  it('grounds entities with injected clients without live network calls', async () => {
    const wikidata = async (query: string): Promise<KnowledgeGraphEntity[]> => [
      {
        label: query,
        description: 'test entity',
        matchedText: query,
        wikidataId: 'Q1',
        wikidataUrl: 'https://www.wikidata.org/wiki/Q1',
        source: 'wikidata',
        confidence: 0.88
      }
    ]
    const dbpedia = async (query: string): Promise<KnowledgeGraphEntity[]> => [
      {
        label: query,
        matchedText: query,
        dbpediaUri: `http://dbpedia.org/resource/${query.replace(/\s+/g, '_')}`,
        dbpediaUrl: `https://dbpedia.org/resource/${query.replace(
          /\s+/g,
          '_'
        )}`,
        source: 'dbpedia',
        confidence: 0.7
      }
    ]

    const resolved = await groundEntities('Tell me about Cape Verde', [], {
      clients: { wikidata, dbpedia }
    })

    expect(resolved).toHaveLength(1)
    expect(resolved[0]).toMatchObject({
      canonicalName: 'Cape Verde',
      source: 'both',
      ambiguous: false
    })
  })
})
