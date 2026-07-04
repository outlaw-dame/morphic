import { z } from 'zod'

import {
  EvidenceRoleSchema,
  ModelRoleSchema,
  ResearchModeSchema,
  RiskLevelSchema,
  SourceClassSchema
} from './core'

export const RoutePlanSchema = z.object({
  mode: ResearchModeSchema,
  riskLevel: RiskLevelSchema,
  requiredSourceClasses: z.array(SourceClassSchema).default([]),
  requiredModelRoles: z.array(ModelRoleSchema).default([]),
  needsFreshness: z.boolean().default(false),
  needsEntityGrounding: z.boolean().default(false),
  needsAdvisorReview: z.boolean().default(false),
  needsCitationVerification: z.boolean().default(true),
  maxToolCalls: z.number().int().positive().max(100).default(20),
  rationale: z.string().min(1)
})
export type RoutePlan = z.infer<typeof RoutePlanSchema>

export const CoordinatorDecisionSchema = z.object({
  routePlan: RoutePlanSchema,
  activeModelRoles: z.array(ModelRoleSchema).default([]),
  retrievalPaths: z.array(z.string().min(1)).default([]),
  parallelizable: z.boolean().default(false),
  stopConditions: z.array(z.string().min(1)).default([]),
  escalationReasons: z.array(z.string().min(1)).default([])
})
export type CoordinatorDecision = z.infer<typeof CoordinatorDecisionSchema>

export const EvidenceItemSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  sourceClass: SourceClassSchema,
  evidenceRole: EvidenceRoleSchema,
  claimIds: z.array(z.string().min(1)).default([]),
  quotedText: z.string().nullish(),
  summary: z.string().min(1),
  retrievalPath: z.string().min(1),
  publishedAt: z.string().datetime().nullish(),
  retrievedAt: z.string().datetime(),
  confidence: z.number().min(0).max(1)
})
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>

export function parseRoutePlan(input: unknown): RoutePlan {
  return RoutePlanSchema.parse(input)
}

export function parseCoordinatorDecision(input: unknown): CoordinatorDecision {
  return CoordinatorDecisionSchema.parse(input)
}

export function parseEvidenceItem(input: unknown): EvidenceItem {
  return EvidenceItemSchema.parse(input)
}
