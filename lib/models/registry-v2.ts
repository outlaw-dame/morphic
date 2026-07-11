import { z } from 'zod'

import {
  ModelCapabilitySchema,
  ModelRoleSchema,
  type ModelCapability,
  type ModelRole
} from '@/lib/ai/schemas'
import type { Model } from '@/lib/types/models'

export const CapabilityProvenanceSchema = z.enum([
  'provider_declared',
  'deployment_configured',
  'model_card_declared',
  'inferred',
  'evaluation_verified',
  'unknown'
])
export type CapabilityProvenance = z.infer<typeof CapabilityProvenanceSchema>

export const ModelAvailabilitySchema = z.enum([
  'available',
  'disabled',
  'deprecated',
  'unavailable'
])
export type ModelAvailability = z.infer<typeof ModelAvailabilitySchema>

export const ModelLocalitySchema = z.enum(['local', 'remote'])
export type ModelLocality = z.infer<typeof ModelLocalitySchema>

export const ReliabilityTierSchema = z.enum([
  'unknown',
  'experimental',
  'standard',
  'strong'
])
export type ReliabilityTier = z.infer<typeof ReliabilityTierSchema>

export const CapabilityEvidenceSchema = z
  .object({
    capability: ModelCapabilitySchema,
    provenance: CapabilityProvenanceSchema,
    verifiedAt: z.string().datetime({ offset: true }).nullable(),
    reference: z.string().min(1).max(512).nullable()
  })
  .strict()
export type CapabilityEvidence = z.infer<typeof CapabilityEvidenceSchema>

export const RoleQualityScoreSchema = z
  .object({
    role: ModelRoleSchema,
    score: z.number().min(0).max(1),
    fixtureVersion: z.string().min(1).max(128),
    evaluatedAt: z.string().datetime({ offset: true })
  })
  .strict()
export type RoleQualityScore = z.infer<typeof RoleQualityScoreSchema>

export const CircuitBreakerMetadataSchema = z
  .object({
    state: z.enum(['closed', 'open', 'half_open']),
    consecutiveTransientFailures: z.number().int().nonnegative().max(1000),
    cooldownUntil: z.string().datetime({ offset: true }).nullable(),
    permanentConfigurationError: z.boolean()
  })
  .strict()
export type CircuitBreakerMetadata = z.infer<
  typeof CircuitBreakerMetadataSchema
>

export const RegisteredModelSchema = z
  .object({
    providerId: z.string().min(1).max(128),
    modelId: z.string().min(1).max(256),
    modelFamily: z.string().min(1).max(128),
    availability: ModelAvailabilitySchema,
    locality: ModelLocalitySchema,
    reliability: ReliabilityTierSchema,
    maxContextTokens: z.number().int().positive().max(10_000_000).nullable(),
    latencyClass: z.enum(['low', 'medium', 'high', 'unknown']),
    costClass: z.enum(['free', 'low', 'medium', 'high', 'unknown']),
    supportsCancellation: z.boolean(),
    privacyClasses: z
      .array(z.enum(['public', 'private', 'sensitive']))
      .min(1)
      .max(3),
    capabilityEvidence: z.array(CapabilityEvidenceSchema).max(64),
    roleQualityScores: z.array(RoleQualityScoreSchema).max(32),
    circuitBreaker: CircuitBreakerMetadataSchema
  })
  .strict()
export type RegisteredModel = z.infer<typeof RegisteredModelSchema>

const PROVIDER_DEFAULT_CAPABILITIES: Partial<
  Record<string, readonly ModelCapability[]>
> = {
  anthropic: ['tool_calling', 'structured_output', 'streaming', 'json_mode'],
  azure: ['tool_calling', 'structured_output', 'streaming', 'json_mode'],
  gateway: ['tool_calling', 'structured_output', 'streaming', 'json_mode'],
  google: ['tool_calling', 'structured_output', 'streaming', 'json_mode'],
  mistral: ['tool_calling', 'structured_output', 'streaming', 'json_mode'],
  openai: ['tool_calling', 'structured_output', 'streaming', 'json_mode'],
  'openai-compatible': [
    'tool_calling',
    'structured_output',
    'streaming',
    'json_mode'
  ],
  openrouter: ['tool_calling', 'structured_output', 'streaming', 'json_mode'],
  ollama: ['streaming', 'local_execution'],
  'ollama-cloud': ['streaming']
}

function normalizeCapability(value: string): ModelCapability | null {
  switch (value) {
    case 'tool_calling':
    case 'tools':
    case 'function_calling':
      return 'tool_calling'
    case 'structured_output':
    case 'structured_outputs':
      return 'structured_output'
    case 'streaming':
      return 'streaming'
    case 'reasoning':
      return 'reasoning'
    case 'vision':
    case 'image_input':
      return 'vision'
    case 'pdf_input':
    case 'pdf':
      return 'pdf_input'
    case 'json_mode':
    case 'json':
      return 'json_mode'
    case 'local_execution':
    case 'local':
      return 'local_execution'
    default:
      return null
  }
}

function capabilityEvidence(
  capabilities: readonly ModelCapability[],
  provenance: CapabilityProvenance
): CapabilityEvidence[] {
  return capabilities.map(capability => ({
    capability,
    provenance,
    verifiedAt: null,
    reference: null
  }))
}

function inferFamily(modelId: string): string {
  const normalized = modelId.toLowerCase()
  const separators = ['/', ':']
  for (const separator of separators) {
    const first = normalized.split(separator)[0]
    if (first) return first.slice(0, 128)
  }
  return normalized.slice(0, 128)
}

export type RegisterModelOptions = {
  availability?: ModelAvailability
  locality?: ModelLocality
  reliability?: ReliabilityTier
  maxContextTokens?: number | null
  latencyClass?: RegisteredModel['latencyClass']
  costClass?: RegisteredModel['costClass']
  supportsCancellation?: boolean
  privacyClasses?: RegisteredModel['privacyClasses']
  modelFamily?: string
  providerDeclaredCapabilities?: ModelCapability[]
  modelCardCapabilities?: ModelCapability[]
  evaluationVerifiedCapabilities?: ModelCapability[]
  roleQualityScores?: RoleQualityScore[]
  circuitBreaker?: CircuitBreakerMetadata
}

export function registerModel(
  model: Pick<Model, 'capabilities' | 'id' | 'providerId'>,
  options: RegisterModelOptions = {}
): RegisteredModel {
  const configuredCapabilities = (model.capabilities ?? [])
    .map(normalizeCapability)
    .filter((capability): capability is ModelCapability => capability !== null)
  const inferredCapabilities = PROVIDER_DEFAULT_CAPABILITIES[model.providerId] ?? []

  return RegisteredModelSchema.parse({
    providerId: model.providerId,
    modelId: model.id,
    modelFamily: options.modelFamily ?? inferFamily(model.id),
    availability: options.availability ?? 'available',
    locality:
      options.locality ?? (model.providerId === 'ollama' ? 'local' : 'remote'),
    reliability:
      options.reliability ??
      (model.providerId === 'nvidia' ? 'experimental' : 'unknown'),
    maxContextTokens: options.maxContextTokens ?? null,
    latencyClass: options.latencyClass ?? 'unknown',
    costClass: options.costClass ?? 'unknown',
    supportsCancellation: options.supportsCancellation ?? false,
    privacyClasses: options.privacyClasses ?? ['public'],
    capabilityEvidence: [
      ...capabilityEvidence(inferredCapabilities, 'inferred'),
      ...capabilityEvidence(configuredCapabilities, 'deployment_configured'),
      ...capabilityEvidence(
        options.providerDeclaredCapabilities ?? [],
        'provider_declared'
      ),
      ...capabilityEvidence(
        options.modelCardCapabilities ?? [],
        'model_card_declared'
      ),
      ...capabilityEvidence(
        options.evaluationVerifiedCapabilities ?? [],
        'evaluation_verified'
      )
    ],
    roleQualityScores: options.roleQualityScores ?? [],
    circuitBreaker: options.circuitBreaker ?? {
      state: 'closed',
      consecutiveTransientFailures: 0,
      cooldownUntil: null,
      permanentConfigurationError: false
    }
  })
}

export function getCapabilityProvenance(
  model: RegisteredModel,
  capability: ModelCapability
): readonly CapabilityProvenance[] {
  return model.capabilityEvidence
    .filter(entry => entry.capability === capability)
    .map(entry => entry.provenance)
}

export function getRoleQualityScore(
  model: RegisteredModel,
  role: ModelRole
): RoleQualityScore | null {
  const matches = model.roleQualityScores.filter(score => score.role === role)
  return matches.sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt))[0] ?? null
}
