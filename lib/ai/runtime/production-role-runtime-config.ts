import { z } from 'zod'

import {
  ModelCapabilitySchema,
  type ModelRole,
  ModelRoleSchema
} from '@/lib/ai/schemas'
import { getRoleSelectionProfileV2 } from '@/lib/models/role-profiles-v2'
import {
  type RoleModelCandidate,
  selectModelForRoleV2
} from '@/lib/models/role-selection-v2'

const MAX_CONFIG_BYTES = 256_000
const MAX_CANDIDATES = 64
const MAX_REASONS = 32
const textEncoder = new TextEncoder()

const SUPPORTED_RUNTIME_ROLES = [
  'answer_composer',
  'advisor',
  'citation_verifier'
] as const satisfies readonly ModelRole[]

const SUPPORTED_PROVIDER_IDS = new Set([
  'openai',
  'anthropic',
  'google',
  'mistral',
  'openai-compatible',
  'nvidia',
  'ollama-cloud',
  'gateway',
  'cloudflare',
  'openrouter',
  'ollama'
])

const CapabilityAssertionSchema = z
  .object({
    capability: ModelCapabilitySchema,
    provenance: z.enum([
      'evaluation_verified',
      'deployment_configured',
      'model_card_declared',
      'provider_declared',
      'inferred',
      'unknown'
    ])
  })
  .strict()

const RoleQualitySchema = z
  .object({
    role: ModelRoleSchema,
    score: z.number().finite().min(0).max(1),
    fixtureVersion: z.string().trim().min(1).max(128),
    verifiedAt: z.string().datetime({ offset: true })
  })
  .strict()

const CandidateSchema = z
  .object({
    providerId: z.string().trim().min(1).max(128),
    modelId: z.string().trim().min(1).max(256),
    family: z.string().trim().min(1).max(128),
    availability: z.enum([
      'available',
      'disabled',
      'deprecated',
      'unavailable'
    ]),
    locality: z.enum(['local', 'remote']),
    reliability: z.enum(['unknown', 'experimental', 'standard', 'strong']),
    maxContextTokens: z.number().int().positive().max(10_000_000),
    estimatedLatencyMs: z.number().finite().nonnegative().max(600_000),
    estimatedCostPerMillionTokensUsd: z
      .number()
      .finite()
      .nonnegative()
      .max(100_000),
    capabilities: z.array(CapabilityAssertionSchema).max(64),
    roleQuality: z.array(RoleQualitySchema).max(64),
    cooldownUntil: z.string().datetime({ offset: true }).nullable().optional()
  })
  .strict()

const RuntimeConfigSchema = z
  .object({
    version: z.literal(1),
    candidates: z.array(CandidateSchema).min(1).max(MAX_CANDIDATES)
  })
  .strict()

export type ProductionRoleRuntimePlan = Readonly<{
  status: 'ready'
  version: 1
  selectedByRole: Readonly<
    Record<(typeof SUPPORTED_RUNTIME_ROLES)[number], RoleModelCandidate>
  >
}>

export type ProductionRoleRuntimeUnavailable = Readonly<{
  status: 'unavailable'
  reasonCodes: readonly string[]
}>

export type ProductionRoleRuntimeResolution =
  | ProductionRoleRuntimePlan
  | ProductionRoleRuntimeUnavailable

function unavailable(...reasons: string[]): ProductionRoleRuntimeUnavailable {
  return Object.freeze({
    status: 'unavailable' as const,
    reasonCodes: Object.freeze([...new Set(reasons)].slice(0, MAX_REASONS))
  })
}

function hasDuplicateCandidateIdentities(
  candidates: readonly RoleModelCandidate[]
): boolean {
  const identities = candidates.map(
    candidate => `${candidate.providerId}/${candidate.modelId}`
  )
  return new Set(identities).size !== identities.length
}

function hasUnsupportedProvider(
  candidates: readonly RoleModelCandidate[]
): boolean {
  return candidates.some(
    candidate => !SUPPORTED_PROVIDER_IDS.has(candidate.providerId)
  )
}

export function resolveProductionRoleRuntimeConfig(input: Readonly<{
  rawConfig: string | undefined
  now?: Date
}>): ProductionRoleRuntimeResolution {
  if (!input || typeof input !== 'object') {
    return unavailable('invalid_runtime_config_input')
  }
  const rawConfig = input.rawConfig
  if (rawConfig === undefined || rawConfig.trim().length === 0) {
    return unavailable('runtime_config_missing')
  }
  if (textEncoder.encode(rawConfig).byteLength > MAX_CONFIG_BYTES) {
    return unavailable('runtime_config_too_large')
  }

  let decoded: unknown
  try {
    decoded = JSON.parse(rawConfig)
  } catch {
    return unavailable('runtime_config_invalid_json')
  }

  const parsed = RuntimeConfigSchema.safeParse(decoded)
  if (!parsed.success) {
    return unavailable('runtime_config_schema_invalid')
  }

  const candidates = parsed.data.candidates as readonly RoleModelCandidate[]
  if (hasDuplicateCandidateIdentities(candidates)) {
    return unavailable('runtime_config_duplicate_candidate')
  }
  if (hasUnsupportedProvider(candidates)) {
    return unavailable('runtime_config_unsupported_provider')
  }

  const now = input.now ?? new Date()
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return unavailable('runtime_config_invalid_time')
  }

  const selectedEntries: Array<
    readonly [(typeof SUPPORTED_RUNTIME_ROLES)[number], RoleModelCandidate]
  > = []
  const reasons: string[] = []

  for (const role of SUPPORTED_RUNTIME_ROLES) {
    const decision = selectModelForRoleV2(
      candidates,
      getRoleSelectionProfileV2(role),
      { now }
    )
    if (decision.status !== 'selected' || decision.candidate === null) {
      reasons.push(`no_eligible_model:${role}`)
      continue
    }
    selectedEntries.push([role, decision.candidate])
  }

  if (reasons.length > 0) return unavailable(...reasons)

  return Object.freeze({
    status: 'ready' as const,
    version: 1 as const,
    selectedByRole: Object.freeze(Object.fromEntries(selectedEntries)) as Readonly<
      Record<(typeof SUPPORTED_RUNTIME_ROLES)[number], RoleModelCandidate>
    >
  })
}

export function loadProductionRoleRuntimeConfig(
  now = new Date()
): ProductionRoleRuntimeResolution {
  return resolveProductionRoleRuntimeConfig({
    rawConfig: process.env.MORPHIC_GOVERNED_ROLE_CANDIDATES_JSON,
    now
  })
}
