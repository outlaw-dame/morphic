import { z } from 'zod'

import { EvidenceRoleSchema, SourceClassSchema } from './core'

export const SourceQualityAssessmentSchema = z.object({
  sourceClass: SourceClassSchema,
  evidenceRole: EvidenceRoleSchema,
  sourceClassScore: z.number().min(0).max(1),
  topicalAuthorityScore: z.number().min(0).max(1),
  transparencyScore: z.number().min(0).max(1),
  originalityScore: z.number().min(0).max(1),
  freshnessScore: z.number().min(0).max(1),
  corroborationScore: z.number().min(0).max(1),
  conflictOfInterestPenalty: z.number().min(0).max(1).default(0),
  spamOrContentFarmPenalty: z.number().min(0).max(1).default(0),
  userPreferenceModifier: z.number().min(-1).max(1).default(0),
  finalWeight: z.number().min(0).max(1),
  influenceCap: z.number().min(0).max(1),
  requiresCorroboration: z.boolean().default(false),
  allowedClaimTypes: z.array(z.string().min(1)).default([]),
  disallowedClaimTypes: z.array(z.string().min(1)).default([])
})
export type SourceQualityAssessment = z.infer<
  typeof SourceQualityAssessmentSchema
>

export const AdvisorSeveritySchema = z.enum([
  'info',
  'warning',
  'error',
  'blocker'
])
export type AdvisorSeverity = z.infer<typeof AdvisorSeveritySchema>

export const AdvisorFindingSchema = z.object({
  severity: AdvisorSeveritySchema,
  claimId: z.string().min(1).nullish(),
  finding: z.string().min(1),
  recommendation: z.string().min(1),
  requiresRepair: z.boolean().default(false)
})
export type AdvisorFinding = z.infer<typeof AdvisorFindingSchema>

export function parseSourceQualityAssessment(
  input: unknown
): SourceQualityAssessment {
  return SourceQualityAssessmentSchema.parse(input)
}

export function parseAdvisorFinding(input: unknown): AdvisorFinding {
  return AdvisorFindingSchema.parse(input)
}
