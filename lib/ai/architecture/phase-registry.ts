import { z } from 'zod'

import {
  ArchitectureImplementationStatusSchema,
  type ArchitectureImplementationStatus
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

const RequirementDispositionSchema = z.enum([
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
    requiredRoles: z
      .array(
        z.enum([
          'router',
          'coordinator',
          'fusion_planner',
          'retriever',
          'source_quality',
          'entity_grounding',
          'answer_composer',
          'advisor',
          'citation_verifier',
          'repair'
        ])
      )
      .max(10),
    historicalRequirements: z
      .array(
        z
          .object({
            source: z.string().min(1).max(256),
            disposition: RequirementDispositionSchema,
            rationale: z.string().min(1).max(512)
          })
          .strict()
      )
      .max(64),
    evidence: z.array(RegistryEvidenceSchema).max(64)
  })
  .strict()
export type AIPhaseRegistryEntry = z.infer<typeof AIPhaseRegistryEntrySchema>

const DOCUMENTED: ArchitectureImplementationStatus = 'documented'

export const AI_PHASE_REGISTRY: readonly AIPhaseRegistryEntry[] = Object.freeze([
  {
    id: 'AI-I0',
    title: 'Canonical contracts and phase reconciliation',
    status: 'implemented_in_isolation',
    dependencies: [],
    requiredRoles: [],
    historicalRequirements: [
      {
        source: 'Original AI-0 through AI-18 requirements',
        disposition: 'carried_forward',
        rationale: 'The crosswalk preserves every beneficial requirement under stable identifiers.'
      }
    ],
    evidence: [
      { kind: 'document', reference: 'docs/AI_ARCHITECTURE_CURRENT.md' },
      { kind: 'document', reference: 'docs/AI_ARCHITECTURE_PHASE_CROSSWALK.md' },
      { kind: 'code', reference: 'lib/ai/architecture/contracts.ts' },
      { kind: 'code', reference: 'lib/ai/architecture/phase-registry.ts' }
    ]
  },
  {
    id: 'AI-I1',
    title: 'Model registry and role-selection policy V2',
    status: DOCUMENTED,
    dependencies: ['AI-I0'],
    requiredRoles: [],
    historicalRequirements: [
      {
        source: 'Original AI-2A model capability registry',
        disposition: 'completed_but_not_integrated',
        rationale: 'Existing capability inference and role selection are retained but require verified provenance and policy V2.'
      }
    ],
    evidence: []
  },
  {
    id: 'AI-I2',
    title: 'Common hardened role runner',
    status: DOCUMENTED,
    dependencies: ['AI-I0', 'AI-I1'],
    requiredRoles: [
      'router',
      'coordinator',
      'fusion_planner',
      'retriever',
      'source_quality',
      'entity_grounding',
      'answer_composer',
      'advisor',
      'citation_verifier',
      'repair'
    ],
    historicalRequirements: [
      {
        source: 'Original AI-3 prompt governance',
        disposition: 'completed_but_not_integrated',
        rationale: 'Versioned prompts and parsers remain inputs to one bounded invocation boundary.'
      }
    ],
    evidence: []
  },
  {
    id: 'AI-I3',
    title: 'Live Router admission',
    status: DOCUMENTED,
    dependencies: ['AI-I0', 'AI-I1', 'AI-I2'],
    requiredRoles: ['router'],
    historicalRequirements: [
      {
        source: 'Original AI-4 Router implementation',
        disposition: 'completed_but_not_integrated',
        rationale: 'The deterministic Router is retained as the non-waivable route floor and fallback.'
      }
    ],
    evidence: []
  },
  {
    id: 'AI-I4',
    title: 'Coordinator finite-state machine',
    status: DOCUMENTED,
    dependencies: ['AI-I0', 'AI-I2', 'AI-I3'],
    requiredRoles: ['coordinator'],
    historicalRequirements: [
      {
        source: 'Original AI-8 and historical Coordinator/repair slices',
        disposition: 'completed_but_not_integrated',
        rationale: 'Policies, repair metadata, scope binding, and persistence contracts are retained as lifecycle building blocks.'
      }
    ],
    evidence: []
  },
  {
    id: 'AI-I5',
    title: 'Fusion planning and bounded retrieval execution',
    status: DOCUMENTED,
    dependencies: ['AI-I2', 'AI-I3', 'AI-I4'],
    requiredRoles: ['fusion_planner', 'retriever', 'coordinator'],
    historicalRequirements: [
      {
        source: 'Original AI-9 provider-agnostic Fusion',
        disposition: 'carried_forward',
        rationale: 'Independent evidence-path planning and execution remain open end-to-end work.'
      }
    ],
    evidence: []
  },
  {
    id: 'AI-I6',
    title: 'Evidence ingestion completeness',
    status: DOCUMENTED,
    dependencies: ['AI-I0', 'AI-I5'],
    requiredRoles: ['coordinator'],
    historicalRequirements: [
      {
        source: 'Original AI-7 Evidence Graph',
        disposition: 'completed_but_not_integrated',
        rationale: 'Existing normalization, dedupe, claims, entities, and conflicts must cover every evidence-producing path.'
      }
    ],
    evidence: []
  },
  {
    id: 'AI-I7',
    title: 'Entity Grounding V2 and provider routing',
    status: DOCUMENTED,
    dependencies: ['AI-I2', 'AI-I3', 'AI-I4', 'AI-I6'],
    requiredRoles: ['entity_grounding', 'coordinator'],
    historicalRequirements: [
      {
        source: 'Original AI-6 Entity Grounding',
        disposition: 'completed_but_not_integrated',
        rationale: 'Wikidata/DBpedia clients and resolution are retained; mandatory routing, provenance, and ambiguity enforcement remain.'
      }
    ],
    evidence: []
  },
  {
    id: 'AI-I8',
    title: 'Source-quality enforcement',
    status: DOCUMENTED,
    dependencies: ['AI-I2', 'AI-I4', 'AI-I6'],
    requiredRoles: ['source_quality', 'coordinator'],
    historicalRequirements: [
      {
        source: 'Original AI-5 Source Quality Engine',
        disposition: 'completed_but_not_integrated',
        rationale: 'Existing classification and caps must become non-bypassable admission and composition policy.'
      }
    ],
    evidence: []
  },
  {
    id: 'AI-I9',
    title: 'Evidence-only Answer Composer',
    status: DOCUMENTED,
    dependencies: ['AI-I4', 'AI-I6', 'AI-I7', 'AI-I8'],
    requiredRoles: ['answer_composer', 'coordinator'],
    historicalRequirements: [
      {
        source: 'Original AI-10 Answer Composer integration',
        disposition: 'carried_forward',
        rationale: 'Governed composition from admitted evidence remains open.'
      }
    ],
    evidence: []
  },
  {
    id: 'AI-I10',
    title: 'Advisor integration',
    status: DOCUMENTED,
    dependencies: ['AI-I2', 'AI-I9'],
    requiredRoles: ['advisor', 'coordinator'],
    historicalRequirements: [
      {
        source: 'Original AI-11 provider-agnostic Advisor',
        disposition: 'carried_forward',
        rationale: 'Prompt/schema scaffolding exists, but live critique and release gating remain open.'
      }
    ],
    evidence: []
  },
  {
    id: 'AI-I11',
    title: 'Citation Verifier integration',
    status: DOCUMENTED,
    dependencies: ['AI-I2', 'AI-I9'],
    requiredRoles: ['citation_verifier', 'coordinator'],
    historicalRequirements: [
      {
        source: 'Original AI-12 Citation Verifier',
        disposition: 'carried_forward',
        rationale: 'Claim-level support verification and release gating remain open.'
      }
    ],
    evidence: []
  },
  {
    id: 'AI-I12',
    title: 'Bounded Repair Agent and re-verification',
    status: DOCUMENTED,
    dependencies: ['AI-I4', 'AI-I10', 'AI-I11'],
    requiredRoles: ['repair', 'citation_verifier', 'coordinator'],
    historicalRequirements: [
      {
        source: 'Historical bounded repair and executor slices',
        disposition: 'completed_but_not_integrated',
        rationale: 'Planning, audit metadata, state, and persistence remain inputs to bounded live repair and independent re-verification.'
      }
    ],
    evidence: []
  },
  {
    id: 'AI-I13',
    title: 'Research trace and privacy controls',
    status: DOCUMENTED,
    dependencies: ['AI-I3', 'AI-I4', 'AI-I5', 'AI-I7', 'AI-I10', 'AI-I11', 'AI-I12'],
    requiredRoles: ['coordinator'],
    historicalRequirements: [
      {
        source: 'Original AI-13 Research trace',
        disposition: 'carried_forward',
        rationale: 'Structured lifecycle observability without private reasoning remains open.'
      }
    ],
    evidence: []
  },
  {
    id: 'AI-I14',
    title: 'End-to-end architecture evaluations',
    status: DOCUMENTED,
    dependencies: ['AI-I3', 'AI-I4', 'AI-I5', 'AI-I7', 'AI-I8', 'AI-I10', 'AI-I11', 'AI-I12', 'AI-I13'],
    requiredRoles: [],
    historicalRequirements: [
      {
        source: 'Original AI-14 behavior evals',
        disposition: 'carried_forward',
        rationale: 'Slice unit tests do not replace end-to-end adversarial architecture gates.'
      }
    ],
    evidence: []
  },
  {
    id: 'AI-I15',
    title: 'Restricted PostgreSQL integration and operations',
    status: DOCUMENTED,
    dependencies: ['AI-I4', 'AI-I12', 'AI-I14'],
    requiredRoles: ['coordinator', 'repair'],
    historicalRequirements: [
      {
        source: 'Historical AI-21 through AI-26 persistence slices',
        disposition: 'completed_but_not_integrated',
        rationale: 'Contracts and PostgreSQL adapter remain disabled until restricted integration and operational verification.'
      }
    ],
    evidence: []
  },
  {
    id: 'AI-I16',
    title: 'Shadow integration and staged rollout',
    status: DOCUMENTED,
    dependencies: ['AI-I13', 'AI-I14', 'AI-I15'],
    requiredRoles: [],
    historicalRequirements: [
      {
        source: 'Original AI-15 Morphic integration stabilization',
        disposition: 'carried_forward',
        rationale: 'Shadowing, canaries, metrics, feature flags, and rollback remain required.'
      }
    ],
    evidence: []
  },
  {
    id: 'AI-I17',
    title: 'Production enforcement and legacy-path removal',
    status: DOCUMENTED,
    dependencies: ['AI-I16'],
    requiredRoles: [],
    historicalRequirements: [
      {
        source: 'Original stabilization and package-boundary requirements',
        disposition: 'superseded_by_stronger_contract',
        rationale: 'Production enforcement requires verified operations and removal of accidental bypasses before extraction.'
      }
    ],
    evidence: []
  },
  {
    id: 'AI-I18',
    title: 'Internal package boundary and extraction decision',
    status: DOCUMENTED,
    dependencies: ['AI-I17'],
    requiredRoles: [],
    historicalRequirements: [
      {
        source: 'Original AI-16 through AI-18 extraction requirements',
        disposition: 'carried_forward',
        rationale: 'Extraction remains conditional on stable boundaries, evals, and a justified second consumer.'
      }
    ],
    evidence: []
  }
].map(entry => AIPhaseRegistryEntrySchema.parse(entry)))

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
    if (STATUS_RANK[entry.status] >= STATUS_RANK.integrated && entry.evidence.length === 0) {
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
      if (STATUS_RANK[entry.status] >= STATUS_RANK.integrated && STATUS_RANK[dependencyEntry.status] < STATUS_RANK.integrated) {
        issues.add('dependency_status_regression')
      }
    }
  })

  const entityPhase = registry.find(entry => entry.id === 'AI-I7')
  const entityRequirementText = entityPhase?.historicalRequirements
    .map(requirement => `${requirement.source} ${requirement.rationale}`.toLowerCase())
    .join(' ')
  if (!entityRequirementText?.includes('wikidata/dbpedia')) {
    issues.add('missing_entity_provider_requirement')
  }

  return Object.freeze([...issues])
}
