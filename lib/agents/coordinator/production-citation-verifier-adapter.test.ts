import { describe, expect, it, vi } from 'vitest'

import type { EvidenceGraph } from '@/lib/ai-architecture/evidence'
import {
  createRouteExecutionContext,
  digestRoutePlan,
  type RouteExecutionContext
} from '@/lib/ai/router/execution-context'
import { buildDeterministicRouteFloor } from '@/lib/ai/router/router-admission'
import {
  createTrustedRoleExecutionScope,
  type RoleProviderAdapter
} from '@/lib/ai/role-runner'
import type { SearchResultItem } from '@/lib/types'

import {
  type AdvisorModelInput,
  createProductionAdvisorAdapter,
  type PendingAdvisorReview
} from './production-advisor-adapter'
import {
  type CitationVerifierModelInput,
  createProductionCitationVerifierAdapter,
  type ProductionCitationVerificationInput
} from './production-citation-verifier-adapter'
import {
  type ComposerModelInput,
  createProductionCompositionAdapter,
  type PendingCompositionDraft
} from './production-composition-adapter'
import {
  type CoordinatorCompositionApproval,
  runGovernedResearchPipeline
} from './governed-pipeline'

const now = new Date('2026-07-11T12:00:00.000Z')
const query = 'Provide medical treatment guidance for a concussion'

type Prepared = Readonly<{
  routeContext: RouteExecutionContext
  evidenceGraph: EvidenceGraph
  approval: CoordinatorCompositionApproval
  composition: PendingCompositionDraft
  advisorReview: PendingAdvisorReview
}>

function routeContext(): RouteExecutionContext {
  const routePlan = buildDeterministicRouteFloor({ query })
  return createRouteExecutionContext({
    routePlan,
    routeDigest: digestRoutePlan(routePlan)
  })
}

function scope(invocationId: string) {
  return createTrustedRoleExecutionScope({
    ownerScopeId: 'owner_scope_00000001',
    executionId: 'execution_00000001',
    invocationId,
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    allowedPermissionClasses: ['none']
  })
}

function candidate(
  role: 'answer_composer' | 'advisor' | 'citation_verifier'
) {
  return {
    providerId: 'provider-a',
    modelId: `${role}-model`,
    family: `${role}-family`,
    availability: 'available',
    locality: 'remote',
    reliability: 'strong',
    maxContextTokens: 64_000,
    estimatedLatencyMs: 100,
    estimatedCostPerMillionTokensUsd: 1,
    capabilities: [
      {
        capability: 'structured_output',
        provenance: 'deployment_configured'
      },
      {
        capability: 'reasoning',
        provenance: 'model_card_declared'
      },
      ...(role === 'answer_composer'
        ? [
            {
              capability: 'streaming',
              provenance: 'deployment_configured'
            }
          ]
        : [])
    ],
    roleQuality: [
      {
        role,
        score: 0.99,
        fixtureVersion: `${role}-fixture-v1`,
        verifiedAt: new Date().toISOString()
      }
    ],
    cooldownUntil: null
  }
}

function result(url: string): SearchResultItem {
  return {
    title: 'Authoritative medical source',
    url,
    content:
      'Concussion care should follow evaluation by a qualified medical professional.',
    publishedAt: '2026-07-10T12:00:00.000Z'
  }
}

async function prepare(): Promise<Prepared> {
  let approval: CoordinatorCompositionApproval | undefined
  let evidenceGraph: EvidenceGraph | undefined
  let context: RouteExecutionContext | undefined

  const compositionAdapter = createProductionCompositionAdapter({
    scope: scope('composer_invocation_0001'),
    candidates: [candidate('answer_composer')],
    provider: {
      invoke: async invocation => ({
        output: {
          draft:
            'Concussion care should follow evaluation by a qualified medical professional.',
          citedEvidenceIds: [invocation.input.evidence[0]!.id]
        },
        outputTokens: 16
      })
    }
  })

  const pipeline = await runGovernedResearchPipeline({
    query,
    routeContext: routeContext(),
    retrieval: {
      retrieve: async () => ({
        searchResults: [
          result('https://www.cdc.gov/traumatic-brain-injury/'),
          result('https://www.nih.gov/health-information/concussion')
        ],
        completedRoles: [
          'router',
          'retriever',
          'fusion_planner',
          'source_quality'
        ] as const,
        retrievedAt: now
      })
    },
    composition: {
      async compose(input) {
        approval = input.approval
        evidenceGraph = input.evidenceGraph
        context = input.routeContext
        return compositionAdapter.compose(input)
      }
    },
    maxRetrievalAttempts: 1,
    now
  })

  if (!approval || !evidenceGraph || !context) {
    throw new Error('Failed to capture governed state.')
  }

  const advisorAdapter = createProductionAdvisorAdapter({
    scope: scope('advisor_invocation_00001'),
    candidates: [candidate('advisor')],
    provider: {
      invoke: async () => ({
        output: {
          decision: 'approve',
          reasonCodes: ['advisor_ready'],
          unsupportedClaimIds: [],
          citationRiskEvidenceIds: [],
          confidence: 0.96
        },
        outputTokens: 8
      })
    }
  })
  const advisorReview = await advisorAdapter.review({
    query,
    routeContext: context,
    evidenceGraph,
    approval,
    composition: pipeline.output
  })

  return {
    routeContext: context,
    evidenceGraph,
    approval,
    composition: pipeline.output,
    advisorReview
  }
}

function verifier(provider: RoleProviderAdapter<CitationVerifierModelInput>) {
  return createProductionCitationVerifierAdapter({
    scope: scope('citation_invocation_0001'),
    candidates: [candidate('citation_verifier')],
    provider
  })
}

function verificationInput(
  prepared: Prepared,
  signal?: AbortSignal
): ProductionCitationVerificationInput {
  return {
    query,
    routeContext: prepared.routeContext,
    evidenceGraph: prepared.evidenceGraph,
    approval: prepared.approval,
    composition: prepared.composition,
    advisorReview: prepared.advisorReview,
    ...(signal ? { signal } : {})
  }
}

describe('AI-I3I evidence-bound Citation Verifier adapter', () => {
  it('receives only the draft and cited approved evidence without tools', async () => {
    const prepared = await prepare()
    const provider: RoleProviderAdapter<CitationVerifierModelInput> = {
      invoke: vi.fn(async invocation => {
        expect(invocation.role).toBe('citation_verifier')
        expect(invocation.permissionClass).toBe('none')
        expect(invocation.input.draft).toBe(prepared.composition.draft)
        expect(invocation.input.citedEvidence).toHaveLength(1)
        expect(invocation.input).not.toHaveProperty('searchResults')
        expect(invocation.input).not.toHaveProperty('tools')
        expect(Object.isFrozen(invocation.input)).toBe(true)
        return {
          output: {
            decision: 'verified',
            reasonCodes: ['citations_verified'],
            verifiedEvidenceIds: [...invocation.input.citedEvidenceIds],
            unsupportedEvidenceIds: [],
            missingCitationClaimIds: [],
            confidence: 0.98
          },
          outputTokens: 10
        }
      })
    }

    const verification = await verifier(provider).verify(
      verificationInput(prepared)
    )

    expect(verification.decision).toBe('verified')
    expect(verification.releaseStatus).toBe(
      'pending_final_deterministic_release'
    )
    expect(verification.roleExecution.status).toBe('succeeded')
    expect(provider.invoke).toHaveBeenCalledTimes(1)
  })

  it('rejects a forged Coordinator approval before provider invocation', async () => {
    const prepared = await prepare()
    const provider: RoleProviderAdapter<CitationVerifierModelInput> = {
      invoke: vi.fn()
    }

    await expect(
      verifier(provider).verify({
        ...verificationInput(prepared),
        approval: {
          routeDigest: prepared.routeContext.routeDigest,
          evidenceGraph: prepared.evidenceGraph
        } as CoordinatorCompositionApproval
      })
    ).rejects.toThrow('Invalid Coordinator composition approval.')
    expect(provider.invoke).not.toHaveBeenCalled()
  })

  it('rejects a non-approving Advisor review', async () => {
    const prepared = await prepare()
    const provider: RoleProviderAdapter<CitationVerifierModelInput> = {
      invoke: vi.fn()
    }
    const blocked = {
      ...prepared.advisorReview,
      decision: 'block'
    } as PendingAdvisorReview

    await expect(
      verifier(provider).verify({
        ...verificationInput(prepared),
        advisorReview: blocked
      })
    ).rejects.toThrow('Advisor review did not approve citation verification.')
    expect(provider.invoke).not.toHaveBeenCalled()
  })

  it('requires every cited evidence item for a verified decision', async () => {
    const prepared = await prepare()
    const provider: RoleProviderAdapter<CitationVerifierModelInput> = {
      invoke: vi.fn(async () => ({
        output: {
          decision: 'verified',
          reasonCodes: ['citations_verified'],
          verifiedEvidenceIds: [],
          unsupportedEvidenceIds: [],
          missingCitationClaimIds: [],
          confidence: 0.9
        },
        outputTokens: 8
      }))
    }

    await expect(
      verifier(provider).verify(verificationInput(prepared))
    ).rejects.toThrow('Citation Verifier did not verify every cited evidence item.')
  })

  it('rejects evidence identifiers outside the cited set', async () => {
    const prepared = await prepare()
    const provider: RoleProviderAdapter<CitationVerifierModelInput> = {
      invoke: vi.fn(async () => ({
        output: {
          decision: 'repair',
          reasonCodes: ['citation_missing_support'],
          verifiedEvidenceIds: [],
          unsupportedEvidenceIds: ['forged-evidence-id'],
          missingCitationClaimIds: [],
          confidence: 0.5
        },
        outputTokens: 8
      }))
    }

    await expect(
      verifier(provider).verify(verificationInput(prepared))
    ).rejects.toThrow(
      'Citation Verifier referenced evidence outside the cited set.'
    )
  })

  it('rejects malformed verified output through the hardened role runner', async () => {
    const prepared = await prepare()
    const provider: RoleProviderAdapter<CitationVerifierModelInput> = {
      invoke: vi.fn(async () => ({
        output: {
          decision: 'verified',
          reasonCodes: [],
          verifiedEvidenceIds: prepared.composition.citedEvidenceIds,
          unsupportedEvidenceIds: [],
          missingCitationClaimIds: [],
          confidence: 0.9
        },
        outputTokens: 8
      }))
    }

    await expect(
      verifier(provider).verify(verificationInput(prepared))
    ).rejects.toThrow('Citation Verifier execution failed: malformed_output.')
  })

  it('preserves cancellation reason during verifier invocation', async () => {
    const prepared = await prepare()
    const controller = new AbortController()
    const provider: RoleProviderAdapter<CitationVerifierModelInput> = {
      invoke: vi.fn(
        () =>
          new Promise<Readonly<{ output: unknown; outputTokens: number }>>(
            () => undefined
          )
      )
    }
    setTimeout(() => controller.abort(new Error('user cancelled verification')), 10)

    await expect(
      verifier(provider).verify(verificationInput(prepared, controller.signal))
    ).rejects.toThrow('user cancelled verification')
    expect(provider.invoke).toHaveBeenCalledTimes(1)
  })
})
