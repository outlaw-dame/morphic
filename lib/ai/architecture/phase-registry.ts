import { z } from 'zod'

import { ModelRoleSchema } from '@/lib/ai/schemas'

import {
  type ArchitectureImplementationStatus,
  ArchitectureImplementationStatusSchema
} from './contracts'

export const AI_INTEGRATION_PHASE_IDS = [
  'AI-I0',
  'AI-I1',
  'AI-I2',
  'AI-I3',
  'AI-I4',
  'AI-I5',
  'AI-I6',
  'AI-I7',
  'AI-I8',
  'AI-I9',
  'AI-I10',
  'AI-I11',
  'AI-I12',
  'AI-I13',
  'AI-I14',
  'AI-I15',
  'AI-I16',
  'AI-I17',
  'AI-I18'
] as const

export const AIIntegrationPhaseIdSchema = z.enum(AI_INTEGRATION_PHASE_IDS)
export type AIIntegrationPhaseId = z.infer<typeof AIIntegrationPhaseIdSchema>

export const RequirementDispositionSchema = z.enum([
  'completed_and_retained',
  'completed_but_not_integrated',
  'carried_forward',
  'superseded_by_stronger_contract',
  'historical_only',
  'rejected'
])
export type RequirementDisposition = z.infer<
  typeof RequirementDispositionSchema
>

const HistoricalRequirementSchema = z
  .object({
    source: z.string().min(1).max(256),
    disposition: RequirementDispositionSchema,
    rationale: z.string().min(1).max(512)
  })
  .strict()

const RegistryEvidenceSchema = z
  .object({
    kind: z.enum(['document', 'code', 'test', 'pull_request', 'operation']),
    reference: z.string().min(1).max(512)
  })
  .strict()

export const AIPhaseRegistryEntrySchema = z
  .object({
    id: AIIntegrationPhaseIdSchema,
    title: z.string().min(1).max(160),
    status: ArchitectureImplementationStatusSchema,
    dependencies: z.array(AIIntegrationPhaseIdSchema).max(18),
    requiredRoles: z.array(ModelRoleSchema).max(ModelRoleSchema.options.length),
    historicalRequirements: z.array(HistoricalRequirementSchema).min(1).max(64),
    evidence: z.array(RegistryEvidenceSchema).max(64)
  })
  .strict()
export type AIPhaseRegistryEntry = z.infer<typeof AIPhaseRegistryEntrySchema>

type PhaseSeed = Omit<AIPhaseRegistryEntry, 'status' | 'evidence'> & {
  status?: ArchitectureImplementationStatus
  evidence?: AIPhaseRegistryEntry['evidence']
}

const phase = (seed: PhaseSeed): AIPhaseRegistryEntry =>
  AIPhaseRegistryEntrySchema.parse({
    status: 'documented',
    evidence: [],
    ...seed
  })

const carried = (
  source: string,
  rationale: string,
  disposition: RequirementDisposition = 'carried_forward'
): AIPhaseRegistryEntry['historicalRequirements'][number] => ({
  source,
  disposition,
  rationale
})

export const AI_PHASE_REGISTRY: readonly AIPhaseRegistryEntry[] = Object.freeze(
  [
    phase({
      id: 'AI-I0',
      title: 'Canonical contracts and phase reconciliation',
      status: 'implemented_in_isolation',
      dependencies: [],
      requiredRoles: [],
      historicalRequirements: [
        carried(
          'Original AI-0 through AI-18 requirements',
          'The crosswalk preserves every beneficial old requirement under stable identifiers.'
        )
      ],
      evidence: [
        { kind: 'document', reference: 'docs/AI_ARCHITECTURE_CURRENT.md' },
        {
          kind: 'document',
          reference: 'docs/AI_ARCHITECTURE_PHASE_CROSSWALK.md'
        },
        { kind: 'code', reference: 'lib/ai/architecture/contracts.ts' },
        { kind: 'code', reference: 'lib/ai/architecture/phase-registry.ts' }
      ]
    }),
    phase({
      id: 'AI-I1',
      title: 'Model registry and role-selection policy V2',
      status: 'implemented_in_isolation',
      dependencies: ['AI-I0'],
      requiredRoles: [],
      historicalRequirements: [
        carried(
          'Original AI-2A model capability registry',
          'Legacy inference remains available, while V2 adds provenance-aware normalization and canonical role policies.',
          'completed_and_retained'
        )
      ],
      evidence: [
        {
          kind: 'document',
          reference: 'docs/AI_PHASE_I1_MODEL_REGISTRY_ROLE_SELECTION_V2.md'
        },
        { kind: 'code', reference: 'lib/models/model-registry-v2.ts' },
        { kind: 'code', reference: 'lib/models/role-selection-v2.ts' },
        { kind: 'code', reference: 'lib/models/role-profiles-v2.ts' },
        { kind: 'test', reference: 'lib/models/model-registry-v2.test.ts' },
        { kind: 'test', reference: 'lib/models/role-selection-v2.test.ts' },
        { kind: 'test', reference: 'lib/models/role-profiles-v2.test.ts' },
        { kind: 'pull_request', reference: 'PR #80' }
      ]
    }),
    phase({
      id: 'AI-I2',
      title: 'Common hardened role runner',
      dependencies: ['AI-I0', 'AI-I1'],
      requiredRoles: [...ModelRoleSchema.options],
      historicalRequirements: [
        carried(
          'Original AI-3 prompt governance',
          'Versioned prompts and parsers remain inputs to one bounded role invocation boundary.',
          'completed_but_not_integrated'
        )
      ]
    }),
    phase({
      id: 'AI-I3',
      title: 'Live Router admission',
      dependencies: ['AI-I0', 'AI-I1', 'AI-I2'],
      requiredRoles: ['router'],
      historicalRequirements: [
        carried(
          'Original AI-4 Router implementation',
          'The deterministic Router remains the non-waivable floor and fallback.',
          'completed_but_not_integrated'
        )
      ]
    }),
    phase({
      id: 'AI-I4',
      title: 'Coordinator finite-state machine',
      dependencies: ['AI-I0', 'AI-I2', 'AI-I3'],
      requiredRoles: ['coordinator'],
      historicalRequirements: [
        carried(
          'Original AI-8 and historical Coordinator/repair slices',
          'Policies, repair metadata, scope binding, and persistence contracts remain lifecycle building blocks.',
          'completed_but_not_integrated'
        )
      ]
    }),
    phase({
      id: 'AI-I5',
      title: 'Fusion planning and bounded retrieval execution',
      dependencies: ['AI-I2', 'AI-I3', 'AI-I4'],
      requiredRoles: ['fusion_planner', 'retriever', 'coordinator'],
      historicalRequirements: [
        carried(
          'Original AI-9 provider-agnostic Fusion',
          'Independent evidence path planning and execution remain open end-to-end work.'
        )
      ]
    }),
    phase({
      id: 'AI-I6',
      title: 'Evidence ingestion completeness',
      dependencies: ['AI-I0', 'AI-I5'],
      requiredRoles: ['coordinator'],
      historicalRequirements: [
        carried(
          'Original AI-7 Evidence Graph',
          'Existing normalization and conflict work must cover every evidence-producing path.',
          'completed_but_not_integrated'
        )
      ]
    }),
    phase({
      id: 'AI-I7',
      title: 'Entity Grounding V2 and provider routing',
      dependencies: ['AI-I2', 'AI-I3', 'AI-I4', 'AI-I6'],
      requiredRoles: ['entity_grounding', 'coordinator'],
      historicalRequirements: [
        carried(
          'Original AI-6 Entity Grounding with Wikidata and DBpedia',
          'Existing clients and resolution are retained; mandatory provider routing, provenance, and ambiguity enforcement remain.',
          'completed_but_not_integrated'
        )
      ]
    }),
    phase({
      id: 'AI-I8',
      title: 'Source-quality enforcement',
      dependencies: ['AI-I2', 'AI-I4', 'AI-I6'],
      requiredRoles: ['source_quality', 'coordinator'],
      historicalRequirements: [
        carried(
          'Original AI-5 Source Quality Engine',
          'Existing classification and caps must become non-bypassable policy.',
          'completed_but_not_integrated'
        )
      ]
    }),
    phase({
      id: 'AI-I9',
      title: 'Evidence-only Answer Composer',
      dependencies: ['AI-I4', 'AI-I6', 'AI-I7', 'AI-I8'],
      requiredRoles: ['answer_composer', 'coordinator'],
      historicalRequirements: [
        carried(
          'Original AI-10 Answer Composer integration',
          'Governed composition from admitted evidence remains open.'
        )
      ]
    }),
    phase({
      id: 'AI-I10',
      title: 'Advisor integration',
      dependencies: ['AI-I2', 'AI-I9'],
      requiredRoles: ['advisor', 'coordinator'],
      historicalRequirements: [
        carried(
          'Original AI-11 provider-agnostic Advisor',
          'Live critique and release gating remain open.'
        )
      ]
    }),
    phase({
      id: 'AI-I11',
      title: 'Citation Verifier integration',
      dependencies: ['AI-I2', 'AI-I9'],
      requiredRoles: ['citation_verifier', 'coordinator'],
      historicalRequirements: [
        carried(
          'Original AI-12 Citation Verifier',
          'Claim-level support verification and release gating remain open.'
        )
      ]
    }),
    phase({
      id: 'AI-I12',
      title: 'Bounded Repair Agent and re-verification',
      dependencies: ['AI-I4', 'AI-I10', 'AI-I11'],
      requiredRoles: ['repair', 'citation_verifier', 'coordinator'],
      historicalRequirements: [
        carried(
          'Historical bounded repair and executor slices',
          'Planning, audit metadata, state, and persistence remain inputs to bounded live repair.',
          'completed_but_not_integrated'
        )
      ]
    }),
    phase({
      id: 'AI-I13',
      title: 'Research trace and privacy controls',
      dependencies: [
        'AI-I3',
        'AI-I4',
        'AI-I5',
        'AI-I7',
        'AI-I10',
        'AI-I11',
        'AI-I12'
      ],
      requiredRoles: ['coordinator'],
      historicalRequirements: [
        carried(
          'Original AI-13 Research trace',
          'Structured lifecycle observability without private reasoning remains open.'
        )
      ]
    }),
    phase({
      id: 'AI-I14',
      title: 'End-to-end architecture evaluations',
      dependencies: [
        'AI-I3',
        'AI-I4',
        'AI-I5',
        'AI-I7',
        'AI-I8',
        'AI-I10',
        'AI-I11',
        'AI-I12',
        'AI-I13'
      ],
      requiredRoles: [],
      historicalRequirements: [
        carried(
          'Original AI-14 behavior evaluations',
          'Slice unit tests do not replace end-to-end adversarial gates.'
        )
      ]
    }),
    phase({
      id: 'AI-I15',
      title: 'Restricted PostgreSQL integration and operations',
      dependencies: ['AI-I4', 'AI-I12', 'AI-I14'],
      requiredRoles: ['coordinator', 'repair'],
      historicalRequirements: [
        carried(
          'Historical AI-21 through AI-26 persistence slices',
          'Contracts and the PostgreSQL adapter stay disabled until restricted integration and operational verification.',
          'completed_but_not_integrated'
        )
      ]
    }),
    phase({
      id: 'AI-I16',
      title: 'Shadow integration and staged rollout',
      dependencies: ['AI-I13', 'AI-I14', 'AI-I15'],
      requiredRoles: [],
      historicalRequirements: [
        carried(
          'Original AI-15 Morphic integration stabilization',
          'Shadowing, canaries, metrics, feature flags, and rollback remain required.'
        )
      ]
    }),
    phase({
      id: 'AI-I17',
      title: 'Production enforcement and legacy-path removal',
      dependencies: ['AI-I16'],
      requiredRoles: [],
      historicalRequirements: [
        carried(
          'Original stabilization and package-boundary requirements',
          'Verified operations and removal of accidental bypasses are required before extraction.',
          'superseded_by_stronger_contract'
        )
      ]
    }),
    phase({
      id: 'AI-I18',
      title: 'Internal package boundary and extraction decision',
      dependencies: ['AI-I17'],
      requiredRoles: [],
      historicalRequirements: [
        carried(
          'Original AI-16 through AI-18 extraction requirements',
          'Extraction remains conditional on stable boundaries, evaluations, and a justified second consumer.'
        )
      ]
    })
  ]
)

const STATUS_RANK: Record<ArchitectureImplementationStatus, number> = {
  documented: 0,
  scaffolded: 1,
  implemented_in_isolation: 2,
  integrated: 3,
  enforced: 4,
  production_enabled: 5
}

export type AIPhaseRegistryValidationIssue =
  | 'duplicate_phase_id'
  | 'missing_phase_id'
  | 'unknown_dependency'
  | 'forward_dependency'
  | 'duplicate_dependency'
  | 'advanced_status_without_evidence'
  | 'dependency_status_regression'
  | 'missing_entity_provider_requirement'

export function validateAIPhaseRegistry(
  registry: readonly AIPhaseRegistryEntry[] = AI_PHASE_REGISTRY
): readonly AIPhaseRegistryValidationIssue[] {
  const issues = new Set<AIPhaseRegistryValidationIssue>()
  const indexes = new Map<AIIntegrationPhaseId, number>()

  registry.forEach((entry, index) => {
    if (indexes.has(entry.id)) issues.add('duplicate_phase_id')
    indexes.set(entry.id, index)
    if (new Set(entry.dependencies).size !== entry.dependencies.length) {
      issues.add('duplicate_dependency')
    }
    if (
      STATUS_RANK[entry.status] >= STATUS_RANK.integrated &&
      entry.evidence.length === 0
    ) {
      issues.add('advanced_status_without_evidence')
    }
  })

  for (const id of AI_INTEGRATION_PHASE_IDS) {
    if (!indexes.has(id)) issues.add('missing_phase_id')
  }

  registry.forEach((entry, index) => {
    for (const dependency of entry.dependencies) {
      const dependencyIndex = indexes.get(dependency)
      if (dependencyIndex === undefined) {
        issues.add('unknown_dependency')
        continue
      }
      if (dependencyIndex >= index) issues.add('forward_dependency')
      const dependencyEntry = registry[dependencyIndex]
      if (
        STATUS_RANK[entry.status] >= STATUS_RANK.integrated &&
        STATUS_RANK[dependencyEntry.status] < STATUS_RANK.integrated
      ) {
        issues.add('dependency_status_regression')
      }
    }
  })

  const entityPhase = registry.find(entry => entry.id === 'AI-I7')
  const entityRequirementText = entityPhase?.historicalRequirements
    .map(requirement =>
      `${requirement.source} ${requirement.rationale}`.toLowerCase()
    )
    .join(' ')
  if (
    !entityRequirementText?.includes('wikidata') ||
    !entityRequirementText.includes('dbpedia')
  ) {
    issues.add('missing_entity_provider_requirement')
  }

  return Object.freeze([...issues])
}
