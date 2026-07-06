import { scoreEntityResolution } from './entity-confidence'
import type {
  EntityMention,
  KnowledgeGraphEntity,
  ResolvedEntity
} from './entity-types'

function labelKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function entityKey(entity: KnowledgeGraphEntity): string {
  return entity.wikidataId || entity.dbpediaUri || labelKey(entity.label)
}

function labelGroupKey(entity: KnowledgeGraphEntity): string {
  return labelKey(entity.label)
}

function mentionMatchesEntity(
  mention: EntityMention,
  entity: KnowledgeGraphEntity
): boolean {
  const mentionKey = labelKey(mention.normalizedText)
  const entityLabelKey = labelKey(entity.label)
  const matchedTextKey = labelKey(entity.matchedText)

  return (
    mentionKey === entityLabelKey ||
    mentionKey === matchedTextKey ||
    entityLabelKey.includes(mentionKey) ||
    mentionKey.includes(entityLabelKey)
  )
}

function canMergeComplementaryCandidates(
  existing: KnowledgeGraphEntity,
  next: KnowledgeGraphEntity
): boolean {
  if (labelGroupKey(existing) !== labelGroupKey(next)) return false
  if (
    existing.wikidataId &&
    next.wikidataId &&
    existing.wikidataId !== next.wikidataId
  ) {
    return false
  }
  if (
    existing.dbpediaUri &&
    next.dbpediaUri &&
    existing.dbpediaUri !== next.dbpediaUri
  ) {
    return false
  }
  return existing.source !== next.source || existing.source === 'both'
}

function mergeEntity(
  existing: KnowledgeGraphEntity,
  next: KnowledgeGraphEntity
): KnowledgeGraphEntity {
  return {
    ...existing,
    description: existing.description || next.description,
    wikidataId: existing.wikidataId || next.wikidataId,
    wikidataUrl: existing.wikidataUrl || next.wikidataUrl,
    dbpediaUri: existing.dbpediaUri || next.dbpediaUri,
    dbpediaUrl: existing.dbpediaUrl || next.dbpediaUrl,
    source: existing.source === next.source ? existing.source : 'both',
    confidence: Math.max(existing.confidence, next.confidence)
  }
}

function ambiguityReasons(
  entity: KnowledgeGraphEntity,
  labelGroup: KnowledgeGraphEntity[],
  keyMap: Map<string, string>
): string[] {
  const reasons: string[] = []
  const distinctKeys = new Set(
    labelGroup.map(candidate => keyMap.get(entityKey(candidate)) ?? entityKey(candidate))
  )

  if (distinctKeys.size > 1) {
    reasons.push('same_label_multiple_canonical_entities')
  }

  const descriptionsByKey = new Map<string, string>()
  for (const candidate of labelGroup) {
    const key = keyMap.get(entityKey(candidate)) ?? entityKey(candidate)
    const description = candidate.description?.toLowerCase().trim()
    if (description && !descriptionsByKey.has(key)) {
      descriptionsByKey.set(key, description)
    }
  }

  const descriptions = new Set(descriptionsByKey.values())
  if (
    descriptions.size > 1 &&
    entity.description &&
    descriptions.has(entity.description.toLowerCase().trim())
  ) {
    reasons.push('same_label_conflicting_descriptions')
  }

  return reasons
}

export function resolveEntities(
  mentions: EntityMention[],
  entities: KnowledgeGraphEntity[],
  maxResolvedEntities = 6
): ResolvedEntity[] {
  const byKey = new Map<string, KnowledgeGraphEntity>()
  const keyMap = new Map<string, string>()
  const labelGroups = new Map<string, KnowledgeGraphEntity[]>()

  for (const entity of entities) {
    const key = entityKey(entity)
    const groupKey = labelGroupKey(entity)
    let mergeKey: string | undefined

    if (byKey.has(key)) {
      mergeKey = key
    } else {
      for (const [existingKey, existing] of byKey.entries()) {
        if (canMergeComplementaryCandidates(existing, entity)) {
          mergeKey = existingKey
          break
        }
      }
    }

    if (mergeKey) {
      const existing = byKey.get(mergeKey)
      if (existing) {
        byKey.set(mergeKey, mergeEntity(existing, entity))
        keyMap.set(key, mergeKey)
      }
    } else {
      byKey.set(key, entity)
      keyMap.set(key, key)
    }

    labelGroups.set(groupKey, [...(labelGroups.get(groupKey) ?? []), entity])
  }

  const resolved: ResolvedEntity[] = []

  for (const entity of byKey.values()) {
    const supportingMentions = mentions.filter(mention =>
      mentionMatchesEntity(mention, entity)
    )
    const support =
      supportingMentions.length > 0 ? supportingMentions : mentions.slice(0, 1)
    const labelGroup = labelGroups.get(labelGroupKey(entity)) ?? [entity]
    const reasons = ambiguityReasons(entity, labelGroup, keyMap)
    const confidence = scoreEntityResolution(entity, support)

    resolved.push({
      ...entity,
      confidence,
      canonicalName: entity.label,
      canonicalUrl: entity.wikidataUrl || entity.dbpediaUrl,
      aliases: [...new Set([entity.label, entity.matchedText])],
      supportingMentions: support,
      ambiguous: reasons.length > 0,
      ambiguityReasons: reasons
    })
  }

  return resolved
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxResolvedEntities)
}
