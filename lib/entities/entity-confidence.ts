import type { EntityMention, KnowledgeGraphEntity } from './entity-types'

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function normalized(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function scoreEntityResolution(
  entity: KnowledgeGraphEntity,
  supportingMentions: EntityMention[]
): number {
  const label = normalized(entity.label)
  const exactMentionBonus = supportingMentions.some(
    mention => normalized(mention.normalizedText) === label
  )
    ? 0.12
    : 0
  const sourceBonus = entity.source === 'both' ? 0.12 : 0
  const authorityBonus = entity.wikidataId ? 0.08 : 0
  const mentionBonus = Math.min(0.16, supportingMentions.length * 0.04)
  const sourceConfidence = Math.min(1, entity.confidence || 0.5)

  return clamp01(
    sourceConfidence * 0.72 +
      exactMentionBonus +
      sourceBonus +
      authorityBonus +
      mentionBonus
  )
}
