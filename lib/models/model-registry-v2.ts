import { z } from 'zod'

import {
  ModelCapabilitySchema,
  ModelRoleSchema,
  type ModelCapability
} from '@/lib/ai/schemas'
import { parseArchitectureContract } from '@/lib/ai/architecture'

import type {
  CapabilityAssertion,
  CapabilityProvenance,
  RoleModelCandidate
} from './role-selection-v2'

const CapabilityProvenanceSchema = z.enum([
  'evaluation_verified',
  'deployment_configured',
  'model_card_declared',
  'provider_declared',
  'inferred',
  'unknown'
])

const CapabilityAssertionSchema = z
  .object({
    capability: ModelCapabilitySchema,
    provenance: CapabilityProvenanceSchema
  })
  .strict()

const RoleQualityScoreSchema = z
  .object({
    role: ModelRoleSchema,
    score: z.number().finite().min(0).max(1),
    fixtureVersion: z.string().min(1).max(128),
    verifiedAt: z.string().datetime()
  })
  .strict()

export const ConfiguredModelRegistryRecordSchema = z
  .object({
    providerId: z.string().trim().min(1).max(128),
    modelId: z.string().trim().min(1).max(256),
    family: z.string().trim().min(1).max(128),
    availability: z.enum(['available', 'disabled', 'deprecated', 'unavailable']),
    locality: z.enum(['local', 'remote']),
    reliability: z.enum(['unknown', 'experimental', 'standard', 'strong']),
    maxContextTokens: z.number().int().positive().max(10_000_000),
    estimatedLatencyMs: z.number().finite().nonnegative().max(600_000),
    estimatedCostPerMillionTokensUsd: z.number().finite().nonnegative().max(100_000),
    capabilityAssertions: z.array(CapabilityAssertionSchema).max(64),
    legacyCapabilities: z.array(z.string().max(64)).max(64).default([]),
    roleQuality: z.array(RoleQualityScoreSchema).max(64),
    cooldownUntil: z.string().datetime().nullable().default(null)
  })
  .strict()

export type ConfiguredModelRegistryRecord = z.infer<
  typeof ConfiguredModelRegistryRecordSchema
>

const PROVENANCE_RANK: Record<CapabilityProvenance, number> = {
  unknown: 0,
  inferred: 1,
  provider_declared: 2,
  model_card_declared: 3,
  deployment_configured: 4,
  evaluation_verified: 5
}

function normalizeLegacyCapability(value: string): ModelCapability | null {
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

function strongestAssertions(
  assertions: readonly CapabilityAssertion[]
): readonly CapabilityAssertion[] {
  const strongest = new Map<ModelCapability, CapabilityProvenance>()

  for (const assertion of assertions) {
    const existing = strongest.get(assertion.capability)
    if (
      existing === undefined ||
      PROVENANCE_RANK[assertion.provenance] > PROVENANCE_RANK[existing]
    ) {
      strongest.set(assertion.capability, assertion.provenance)
    }
  }

  return Object.freeze(
    [...strongest.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([capability, provenance]) => Object.freeze({ capability, provenance }))
  )
}

export function normalizeConfiguredModelRecord(
  input: unknown
): Readonly<RoleModelCandidate> {
  const record = parseArchitectureContract(
    ConfiguredModelRegistryRecordSchema,
    input
  )

  const legacyAssertions = record.legacyCapabilities
    .map(normalizeLegacyCapability)
    .filter((capability): capability is ModelCapability => capability !== null)
    .map(capability => ({ capability, provenance: 'inferred' as const }))

  return Object.freeze({
    providerId: record.providerId,
    modelId: record.modelId,
    family: record.family,
    availability: record.availability,
    locality: record.locality,
    reliability: record.reliability,
    maxContextTokens: record.maxContextTokens,
    estimatedLatencyMs: record.estimatedLatencyMs,
    estimatedCostPerMillionTokensUsd: record.estimatedCostPerMillionTokensUsd,
    capabilities: strongestAssertions([
      ...record.capabilityAssertions,
      ...legacyAssertions
    ]),
    roleQuality: Object.freeze(
      record.roleQuality
        .map(score => Object.freeze({ ...score }))
        .sort((left, right) => {
          const roleDifference = left.role.localeCompare(right.role)
          if (roleDifference !== 0) return roleDifference
          return right.verifiedAt.localeCompare(left.verifiedAt)
        })
    ),
    cooldownUntil: record.cooldownUntil
  })
}

export function normalizeConfiguredModelRegistry(
  inputs: readonly unknown[]
): readonly Readonly<RoleModelCandidate>[] {
  const identities = new Set<string>()
  const candidates = inputs.map(input => normalizeConfiguredModelRecord(input))

  for (const candidate of candidates) {
    const identity = `${candidate.providerId}/${candidate.modelId}`
    if (identities.has(identity)) {
      throw new Error('Duplicate configured model identity')
    }
    identities.add(identity)
  }

  return Object.freeze(
    [...candidates].sort((left, right) =>
      `${left.providerId}/${left.modelId}`.localeCompare(
        `${right.providerId}/${right.modelId}`
      )
    )
  )
}
