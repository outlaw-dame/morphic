import { createHash } from 'node:crypto'
import { z } from 'zod'

import {
  createTrustedRoleExecutionScope,
  runRole,
  type RoleProviderAdapter,
  type RoleRunnerOutcome,
  type TrustedRoleExecutionScope
} from '@/lib/ai/role-runner'
import {
  ModelRoleSchema,
  ResearchModeSchema,
  RiskLevelSchema,
  RoutePlanSchema,
  SourceClassSchema,
  type ModelRole,
  type ResearchMode,
  type RiskLevel,
  type RoutePlan,
  type SourceClass
} from '@/lib/ai/schemas'
import { getRolePrompt } from '@/lib/ai/prompts'

const MAX_QUERY_LENGTH = 16_000
const ROUTER_DEADLINE_MS = 8_000
const ROUTER_MAX_INPUT_BYTES = 24_000
const ROUTER_MAX_OUTPUT_BYTES = 12_000
const ROUTER_MAX_OUTPUT_TOKENS = 1_500

const MODE_RANK: Record<ResearchMode, number> = {
  quick: 0,
  adaptive: 1,
  deep: 2,
  critical: 3
}

const RISK_RANK: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
}

const RouterInputSchema = z
  .object({
    query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
    requestedMode: ResearchModeSchema.optional(),
    deploymentMaxToolCalls: z.number().int().positive().max(100).default(50)
  })
  .strict()

const RouterModelProposalSchema = z
  .object({
    mode: ResearchModeSchema,
    riskLevel: RiskLevelSchema,
    requiresResearch: z.boolean(),
    requiredSourceClasses: z.array(SourceClassSchema).max(16),
    disallowedSourceClasses: z.array(SourceClassSchema).max(16),
    needsFreshness: z.boolean(),
    needsEntityGrounding: z.boolean(),
    needsSourceQuality: z.boolean(),
    needsFusionPlanning: z.boolean(),
    needsAdvisorReview: z.boolean(),
    needsCitationVerification: z.boolean(),
    maxToolCalls: z.number().int().positive().max(100),
    reasonCodes: z
      .array(z.string().regex(/^[a-z0-9_:-]{1,128}$/))
      .max(16)
  })
  .strict()

export type RouterModelProposal = z.infer<typeof RouterModelProposalSchema>

export type RouterAdmissionInput = z.input<typeof RouterInputSchema>

export type RouterModelConfiguration = Readonly<{
  candidates: readonly unknown[]
  adapter: RoleProviderAdapter<Readonly<{ query: string; requestedMode: ResearchMode | null }>>
}>

export type RouterAdmissionResult = Readonly<{
  routePlan: RoutePlan
  routeDigest: string
  scope: TrustedRoleExecutionScope
  deterministicFloor: RoutePlan
  modelExecution: RoleRunnerOutcome<RouterModelProposal> | null
  modelProposalApplied: boolean
}>

const FRESHNESS_PATTERNS = [
  /\b(today|tonight|current|currently|latest|recent|now|breaking|this week|this month|this year)\b/i,
  /\b(price|prices|schedule|score|weather|forecast|release date|availability|in stock|version|changelog)\b/i,
  /\b20(2[6-9]|[3-9]\d)\b/i,
  /\b(current|new|latest)\s+(president|ceo|governor|senator|mayor|chair|director|owner|officeholder)\b/i
]

const HIGH_RISK_PATTERNS = [
  /\b(legal|lawyer|lawsuit|settlement|insurance|contract|court|regulation|compliance|liability)\b/i,
  /\b(financial|investment|tax|loan|mortgage|bankruptcy|credit|securities|retirement)\b/i,
  /\b(election|voting|ballot|polling place|candidate|president|senator|governor|mayor)\b/i,
  /\b(medical|doctor|diagnosis|treatment|symptom|medication|concussion|injury|pregnancy)\b/i,
  /\b(suicide|self[- ]harm|weapon|explosive|malware|ransomware|credential theft)\b/i
]

const CRITICAL_RISK_PATTERNS = [
  /\b(emergency|overdose|poisoning|active shooter|immediate danger|suicidal|kill myself)\b/i,
  /\b(where do i vote|how do i vote|register to vote|polling place)\b/i
]

const ENTITY_TYPE_PATTERNS = [
  /\b(person|people|company|corporation|organization|agency|university|product|place|city|country|event|book|film|song|paper|dataset|law|standard|model|repository|repo)\b/i,
  /\b(ceo|president|founder|author|creator|owner|director|chair|governor|senator|mayor|officeholder)\b/i
]

const ENTITY_RELATION_PATTERNS = [
  /\b(who|what|which)\s+(is|was|are|were|owns|owned|founded|created|wrote|authored|runs|leads|works for|located)\b/i,
  /\b(owned by|founded by|created by|works for|subsidiary of|parent company|headquartered in|located in)\b/i
]

const ENTITY_IDENTIFIER_PATTERNS = [
  /\b(alias|acronym|renamed|formerly|version|model number|handle|username|identifier|ticker|doi|isbn|orcid|github|repository)\b/i,
  /\b[A-Z]{2,8}\b/,
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4}\b/
]

const OFFICIAL_SOURCE_PATTERNS = [
  /\b(law|regulation|policy|official|government|court|filing|statute|case)\b/i,
  /\b(api|docs|documentation|spec|standard|protocol|security advisory)\b/i,
  /\b(company|vendor|product|release|pricing|terms of service)\b/i
]

const ACADEMIC_SOURCE_PATTERNS = [
  /\b(research|study|paper|peer reviewed|clinical trial|systematic review|meta-analysis|standard)\b/i
]

const NON_RESEARCH_PATTERNS = [
  /^\s*(hi|hello|hey|thanks|thank you|good morning|good afternoon|good evening)[!.\s]*$/i,
  /^\s*(rewrite|rephrase|proofread|translate|summarize)\b/i
]

function includesAny(query: string, patterns: readonly RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(query))
}

function uniqueSorted<T extends string>(values: readonly T[]): readonly T[] {
  return Object.freeze([...new Set(values)].sort())
}

function strongerMode(left: ResearchMode, right: ResearchMode): ResearchMode {
  return MODE_RANK[left] >= MODE_RANK[right] ? left : right
}

function strongerRisk(left: RiskLevel, right: RiskLevel): RiskLevel {
  return RISK_RANK[left] >= RISK_RANK[right] ? left : right
}

function inferRequiredSourceClasses(query: string): SourceClass[] {
  const classes: SourceClass[] = []
  if (includesAny(query, OFFICIAL_SOURCE_PATTERNS)) {
    classes.push('official_source')
  }
  if (includesAny(query, HIGH_RISK_PATTERNS)) {
    classes.push('government_or_regulator')
  }
  if (includesAny(query, ACADEMIC_SOURCE_PATTERNS)) {
    classes.push('academic_or_peer_reviewed')
  }
  return [...uniqueSorted(classes)]
}

function inferRequiredRoles(route: Omit<RoutePlan, 'requiredModelRoles'>): ModelRole[] {
  if (!route.requiresResearch) return ['router']

  const roles: ModelRole[] = ['router', 'retriever', 'answer_composer']
  if (route.needsFusionPlanning) roles.push('fusion_planner')
  if (route.needsSourceQuality) roles.push('source_quality')
  if (route.needsEntityGrounding) roles.push('entity_grounding')
  if (route.needsAdvisorReview) roles.push('advisor')
  if (route.needsCitationVerification) roles.push('citation_verifier')
  if (route.needsAdvisorReview || route.needsCitationVerification) {
    roles.push('repair')
  }
  return [...uniqueSorted(roles.map(role => ModelRoleSchema.parse(role)))]
}

function routeRationale(reasonCodes: readonly string[]): string {
  return `Router admission reasons: ${reasonCodes.join(', ') || 'default_research_route'}.`
}

export function buildDeterministicRouteFloor(input: RouterAdmissionInput): RoutePlan {
  const parsed = RouterInputSchema.parse(input)
  const query = parsed.query
  const criticalRisk = includesAny(query, CRITICAL_RISK_PATTERNS)
  const highRisk = criticalRisk || includesAny(query, HIGH_RISK_PATTERNS)
  const needsFreshness = includesAny(query, FRESHNESS_PATTERNS)
  const needsEntityGrounding =
    includesAny(query, ENTITY_TYPE_PATTERNS) ||
    includesAny(query, ENTITY_RELATION_PATTERNS) ||
    includesAny(query, ENTITY_IDENTIFIER_PATTERNS)
  const explicitNonResearch = includesAny(query, NON_RESEARCH_PATTERNS)
  const requiresResearch =
    !explicitNonResearch || highRisk || needsFreshness || needsEntityGrounding

  const riskLevel: RiskLevel = criticalRisk
    ? 'critical'
    : highRisk
      ? 'high'
      : 'low'

  let mode: ResearchMode = requiresResearch ? 'adaptive' : 'quick'
  if (needsFreshness || needsEntityGrounding) mode = 'adaptive'
  if (highRisk) mode = 'critical'
  if (parsed.requestedMode) mode = strongerMode(mode, parsed.requestedMode)

  const needsSourceQuality = requiresResearch && (highRisk || needsFreshness)
  const needsFusionPlanning =
    requiresResearch && (highRisk || needsFreshness || needsEntityGrounding)
  const needsAdvisorReview = highRisk
  const needsCitationVerification = requiresResearch

  const reasonCodes: string[] = ['deterministic_floor']
  if (!requiresResearch) reasonCodes.push('explicit_non_research')
  if (needsFreshness) reasonCodes.push('freshness_required')
  if (needsEntityGrounding) reasonCodes.push('entity_grounding_required')
  if (needsSourceQuality) reasonCodes.push('source_quality_required')
  if (needsFusionPlanning) reasonCodes.push('fusion_required')
  if (highRisk) reasonCodes.push('high_risk_domain')
  if (criticalRisk) reasonCodes.push('critical_risk_domain')

  const base = {
    mode,
    riskLevel,
    requiresResearch,
    requiredSourceClasses: inferRequiredSourceClasses(query),
    disallowedSourceClasses: ['content_farm', 'scraper_or_aggregator'] as SourceClass[],
    needsFreshness,
    needsEntityGrounding,
    needsSourceQuality,
    needsFusionPlanning,
    needsAdvisorReview,
    needsCitationVerification,
    maxToolCalls: Math.min(
      parsed.deploymentMaxToolCalls,
      mode === 'critical' ? 50 : mode === 'deep' ? 40 : mode === 'adaptive' ? 30 : 10
    ),
    reasonCodes: [...uniqueSorted(reasonCodes)],
    rationale: routeRationale(uniqueSorted(reasonCodes))
  } satisfies Omit<RoutePlan, 'requiredModelRoles'>

  return Object.freeze(
    RoutePlanSchema.parse({
      ...base,
      requiredModelRoles: inferRequiredRoles(base)
    })
  )
}

export function mergeRouterProposal(
  floor: RoutePlan,
  proposal: RouterModelProposal
): RoutePlan {
  const parsedProposal = RouterModelProposalSchema.parse(proposal)
  const disallowed = uniqueSorted([
    ...floor.disallowedSourceClasses,
    ...parsedProposal.disallowedSourceClasses
  ])
  const disallowedSet = new Set(disallowed)
  const required = uniqueSorted([
    ...floor.requiredSourceClasses,
    ...parsedProposal.requiredSourceClasses
  ]).filter(sourceClass => !disallowedSet.has(sourceClass))

  const reasonCodes = uniqueSorted([
    ...floor.reasonCodes,
    ...parsedProposal.reasonCodes,
    'model_proposal_merged'
  ])

  const mergedWithoutRoles = {
    mode: strongerMode(floor.mode, parsedProposal.mode),
    riskLevel: strongerRisk(floor.riskLevel, parsedProposal.riskLevel),
    requiresResearch: floor.requiresResearch || parsedProposal.requiresResearch,
    requiredSourceClasses: required,
    disallowedSourceClasses: [...disallowed],
    needsFreshness: floor.needsFreshness || parsedProposal.needsFreshness,
    needsEntityGrounding:
      floor.needsEntityGrounding || parsedProposal.needsEntityGrounding,
    needsSourceQuality:
      floor.needsSourceQuality || parsedProposal.needsSourceQuality,
    needsFusionPlanning:
      floor.needsFusionPlanning || parsedProposal.needsFusionPlanning,
    needsAdvisorReview:
      floor.needsAdvisorReview || parsedProposal.needsAdvisorReview,
    needsCitationVerification:
      floor.needsCitationVerification ||
      parsedProposal.needsCitationVerification,
    maxToolCalls: Math.min(floor.maxToolCalls, parsedProposal.maxToolCalls),
    reasonCodes: [...reasonCodes],
    rationale: routeRationale(reasonCodes)
  } satisfies Omit<RoutePlan, 'requiredModelRoles'>

  return Object.freeze(
    RoutePlanSchema.parse({
      ...mergedWithoutRoles,
      requiredModelRoles: inferRequiredRoles(mergedWithoutRoles)
    })
  )
}

function digestRoute(route: RoutePlan): string {
  return createHash('sha256').update(JSON.stringify(route)).digest('hex')
}

export async function admitResearchRoute(options: Readonly<{
  input: RouterAdmissionInput
  ownerScopeId: string
  executionId: string
  invocationId: string
  model?: RouterModelConfiguration
  signal?: AbortSignal
  now?: () => Date
}>): Promise<RouterAdmissionResult> {
  const now = options.now ?? (() => new Date())
  const current = now()
  if (!(current instanceof Date) || !Number.isFinite(current.getTime())) {
    throw new Error('Invalid Router clock.')
  }

  const floor = buildDeterministicRouteFloor(options.input)
  const scope = createTrustedRoleExecutionScope({
    ownerScopeId: options.ownerScopeId,
    executionId: options.executionId,
    invocationId: options.invocationId,
    deadlineAt: new Date(current.getTime() + ROUTER_DEADLINE_MS).toISOString(),
    allowedPermissionClasses: ['none']
  })

  if (!options.model) {
    return Object.freeze({
      routePlan: floor,
      routeDigest: digestRoute(floor),
      scope,
      deterministicFloor: floor,
      modelExecution: null,
      modelProposalApplied: false
    })
  }

  const parsedInput = RouterInputSchema.parse(options.input)
  const prompt = getRolePrompt('router')
  const execution = await runRole({
    scope,
    role: 'router',
    candidates: options.model.candidates,
    prompt: {
      version: prompt.version,
      instruction: prompt.systemPrompt,
      inputSchemaVersion: 1,
      outputSchemaVersion: 1
    },
    inputSchema: z
      .object({
        query: z.string().min(1).max(MAX_QUERY_LENGTH),
        requestedMode: ResearchModeSchema.nullable()
      })
      .strict(),
    outputSchema: RouterModelProposalSchema,
    input: {
      query: parsedInput.query,
      requestedMode: parsedInput.requestedMode ?? null
    },
    adapter: options.model.adapter,
    limits: {
      maxInputBytes: ROUTER_MAX_INPUT_BYTES,
      maxOutputBytes: ROUTER_MAX_OUTPUT_BYTES,
      maxOutputTokens: ROUTER_MAX_OUTPUT_TOKENS
    },
    retryPolicy: {
      maxAttempts: 2,
      initialDelayMs: 100,
      maximumDelayMs: 500,
      idempotent: true
    },
    signal: options.signal,
    now
  })

  const routePlan = execution.output
    ? mergeRouterProposal(floor, execution.output)
    : floor

  return Object.freeze({
    routePlan,
    routeDigest: digestRoute(routePlan),
    scope,
    deterministicFloor: floor,
    modelExecution: execution,
    modelProposalApplied: execution.output !== null
  })
}
