import { z } from 'zod'

import {
  EvidenceRoleSchema,
  ModelRoleSchema,
  ResearchModeSchema,
  RiskLevelSchema,
  SourceClassSchema
} from './core'

export const RoutePlanSchema = z
  .object({
    mode: ResearchModeSchema,
    riskLevel: RiskLevelSchema,
    requiresResearch: z.boolean().default(true),
    requiredSourceClasses: z.array(SourceClassSchema).default([]),
    disallowedSourceClasses: z.array(SourceClassSchema).default([]),
    requiredModelRoles: z.array(ModelRoleSchema).default([]),
    needsFreshness: z.boolean().default(false),
    needsEntityGrounding: z.boolean().default(false),
    needsSourceQuality: z.boolean().default(false),
    needsFusionPlanning: z.boolean().default(false),
    needsAdvisorReview: z.boolean().default(false),
    needsCitationVerification: z.boolean().default(true),
    maxToolCalls: z.number().int().positive().max(100).default(20),
    reasonCodes: z
      .array(z.string().regex(/^[a-z0-9_:-]{1,128}$/))
      .max(32)
      .default([]),
    rationale: z.string().min(1).max(2048)
  })
  .strict()
  .superRefine((value, context) => {
    const required = new Set(value.requiredSourceClasses)
    for (const sourceClass of value.disallowedSourceClasses) {
      if (required.has(sourceClass)) {
        context.addIssue({
          code: 'custom',
          message: 'A source class cannot be both required and disallowed.',
          path: ['disallowedSourceClasses']
        })
      }
    }

    if (!value.requiresResearch && value.mode !== 'quick') {
      context.addIssue({
        code: 'custom',
        message: 'Non-research routes must use quick mode.',
        path: ['mode']
      })
    }
  })

export type CanonicalRoutePlan = z.output<typeof RoutePlanSchema>

type NewRoutePlanFields = Pick<
  CanonicalRoutePlan,
  | 'requiresResearch'
  | 'disallowedSourceClasses'
  | 'needsSourceQuality'
  | 'needsFusionPlanning'
  | 'reasonCodes'
>

export type RoutePlan = Omit<CanonicalRoutePlan, keyof NewRoutePlanFields> &
  Partial<NewRoutePlanFields>

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

export function parseRoutePlan(input: unknown): CanonicalRoutePlan {
  return RoutePlanSchema.parse(input)
}

export function parseCoordinatorDecision(input: unknown): CoordinatorDecision {
  return CoordinatorDecisionSchema.parse(input)
}

export function parseEvidenceItem(input: unknown): EvidenceItem {
  return EvidenceItemSchema.parse(input)
}
