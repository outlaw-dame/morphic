import { z } from 'zod'

import {
  type AdvisorFinding,
  AdvisorFindingSchema,
  type CoordinatorDecision,
  CoordinatorDecisionSchema,
  type EvidenceItem,
  EvidenceItemSchema,
  type ModelRole,
  type RoutePlan,
  RoutePlanSchema,
  type SourceQualityAssessment,
  SourceQualityAssessmentSchema
} from '@/lib/ai/schemas'

export type ParsedRoleOutputByRole = {
  router: RoutePlan
  coordinator: CoordinatorDecision
  retriever: EvidenceItem[]
  source_quality: SourceQualityAssessment
  entity_grounding: unknown
  answer_composer: unknown
  advisor: AdvisorFinding[]
  citation_verifier: AdvisorFinding[]
  repair: unknown
}

export type RoleOutputParseSuccess<Role extends ModelRole> = {
  ok: true
  role: Role
  value: ParsedRoleOutputByRole[Role]
}

export type RoleOutputParseFailure<Role extends ModelRole> = {
  ok: false
  role: Role
  error: string
  issues: string[]
}

export type RoleOutputParseResult<Role extends ModelRole> =
  | RoleOutputParseSuccess<Role>
  | RoleOutputParseFailure<Role>

type RoleOutputSchemas = {
  [Role in ModelRole]: z.ZodType<ParsedRoleOutputByRole[Role]>
}

const ROLE_OUTPUT_SCHEMAS: RoleOutputSchemas = {
  router: RoutePlanSchema,
  coordinator: CoordinatorDecisionSchema,
  retriever: z.array(EvidenceItemSchema),
  source_quality: SourceQualityAssessmentSchema,
  entity_grounding: z.unknown(),
  answer_composer: z.unknown(),
  advisor: z.array(AdvisorFindingSchema),
  citation_verifier: z.array(AdvisorFindingSchema),
  repair: z.unknown()
}

function summarizeIssues(error: z.ZodError): string[] {
  return error.issues.map(issue => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '<root>'
    return `${path}: ${issue.message}`
  })
}

export function parseRoleOutput<Role extends ModelRole>(
  role: Role,
  output: unknown
): RoleOutputParseResult<Role> {
  const schema = ROLE_OUTPUT_SCHEMAS[role]
  const parsed = schema.safeParse(output)

  if (parsed.success) {
    return {
      ok: true,
      role,
      value: parsed.data
    }
  }

  return {
    ok: false,
    role,
    error: `Invalid structured output for ${role}`,
    issues: summarizeIssues(parsed.error)
  }
}
