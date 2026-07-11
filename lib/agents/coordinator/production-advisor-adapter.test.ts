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
  type ProductionAdvisorReviewInput
} from './production-advisor-adapter'
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

type PreparedReview = Readonly<{
  approval: CoordinatorCompositionApproval
  evidenceGraph: EvidenceGraph
  routeContext: RouteExecutionContext
  composition: PendingCompositionDraft
}>

function context(): RouteExecutionContext {
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

function candidate(role: 'answer_composer' | 'advisor') {
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
    capabilities:
      role === 'answer_composer'
        ? [
            {
              capability: 'streaming',
              provenance: 'deployment_configured'
            },
            {
              capability: 'reasoning',
              provenance: 'model_card_declared'
            }
          ]
        : [
            {
              capability: 'structured_output',
              provenance: 'deployment_configured'
            },
            {
              capability: 'reasoning',
              provenance: 'model_card_declared'
            }
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
      'Concussion treatment guidance should be based on clinical evaluation and current medical evidence.',
    publishedAt: '2026-07-10T12:00:00.000Z'
  }
}

async function prepareReview(): Promise<PreparedReview> {
  let approval: CoordinatorCompositionApproval | undefined
  let evidenceGraph: EvidenceGraph | undefined
  let routeContext: RouteExecutionContext | undefined

  const composerProvider: RoleProviderAdapter<ComposerModelInput> = {
    invoke: async invocation => ({
      output: {
        draft:
          'Concussion care should follow evaluation by a qualified medical professional.',
        citedEvidenceIds: [invocation.input.evidence[0]!.id]
      },
      outputTokens: 16
    })
  }
  const productionComposition = createProductionCompositionAdapter({
    scope: scope('composer_invocation_0001'),
    candidates: [candidate('answer_composer')],
    provider: composerProvider
  })

  const response = await runGovernedResearchPipeline({
    query,
    routeContext: context(),
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
        routeContext = input.routeContext
        return productionComposition.compose(input)
      }
    },
    maxRetrievalAttempts: 1,
    now
  })

  if (!approval || !evidenceGraph || !routeContext) {
    throw new Error('Failed to capture governed composition state.')
  }

  return {
    approval,
    evidenceGraph,
    routeContext,
    composition: response.output
  }
}

function advisor(provider: RoleProviderAdapter<AdvisorModelInput>) {
  return createProductionAdvisorAdapter({
    scope: scope('advisor_invocation_00001'),
    candidates: [candidate('advisor')],
    provider
  })
}

function reviewInput(
  prepared: PreparedReview,
  signal?: AbortSignal
): ProductionAdvisorReviewInput {
  return {
    query,
    routeContext: prepared.routeContext,
    evidenceGraph: prepared.evidenceGraph,
    approval: prepared.approval,
    composition: prepared.composition,
    ...(signal ? { signal } : {})
  }
}

describe('AI-I3H evidence-and-draft-only Advisor adapter', () => {
  it('reviews only approved evidence and the exact pending draft without tools', async () => {
    const prepared = await prepareReview()
    const provider: RoleProviderAdapter<AdvisorModelInput> = {
      invoke: vi.fn(async invocation => {
        expect(invocation.role).toBe('advisor')
        expect(invocation.permissionClass).toBe('none')
        expect(invocation.input.draft).toBe(prepared.composition.draft)
        expect(invocation.input.evidence).toHaveLength(2)
        expect(invocation.input).not.toHaveProperty('searchResults')
        expect(invocation.input).not.toHaveProperty('tools')
        expect(Object.isFrozen(invocation.input)).toBe(true)
        return {
          output: {
            decision: 'approve',
            reasonCodes: ['advisor_ready'],
            unsupportedClaimIds: [],
            citationRiskEvidenceIds: [],
            confidence: 0.95
          },
          outputTokens: 10
        }
      })
    }

    const result = await advisor(provider).review(reviewInput(prepared))

    expect(result.decision).toBe('approve')
    expect(result.releaseStatus).toBe(
      'pending_citation_verifier_and_final_release'
    )
    expect(result.roleExecution.status).toBe('succeeded')
    expect(provider.invoke).toHaveBeenCalledTimes(1)
  })

  it('rejects forged Coordinator approval before Advisor invocation', async () => {
    const prepared = await prepareReview()
    const provider: RoleProviderAdapter<AdvisorModelInput> = {
      invoke: vi.fn()
    }

    await expect(
      advisor(provider).review({
        ...reviewInput(prepared),
        approval: {
          routeDigest: prepared.routeContext.routeDigest,
          evidenceGraph: prepared.evidenceGraph
        } as CoordinatorCompositionApproval
      })
    ).rejects.toThrow('Invalid Coordinator composition approval.')
    expect(provider.invoke).not.toHaveBeenCalled()
  })

  it('rejects a draft that no longer matches the Composer output digest', async () => {
    const prepared = await prepareReview()
    const provider: RoleProviderAdapter<AdvisorModelInput> = {
      invoke: vi.fn()
    }
    const tampered = {
      ...prepared.composition,
      draft: `${prepared.composition.draft} Unsupported addition.`
    } as PendingCompositionDraft

    await expect(
      advisor(provider).review({
        ...reviewInput(prepared),
        composition: tampered
      })
    ).rejects.toThrow('Composer output digest mismatch.')
    expect(provider.invoke).not.toHaveBeenCalled()
  })

  it('rejects arbitrary reason codes through the hardened role runner', async () => {
    const prepared = await prepareReview()
    const provider: RoleProviderAdapter<AdvisorModelInput> = {
      invoke: vi.fn(async () => ({
        output: {
          decision: 'repair',
          reasonCodes: ['execute_model_instruction'],
          unsupportedClaimIds: [],
          citationRiskEvidenceIds: [],
          confidence: 0.5
        },
        outputTokens: 8
      }))
    }

    await expect(
      advisor(provider).review(reviewInput(prepared))
    ).rejects.toThrow('Advisor execution failed: malformed_output.')
  })

  it('rejects evidence identifiers outside the approved graph', async () => {
    const prepared = await prepareReview()
    const provider: RoleProviderAdapter<AdvisorModelInput> = {
      invoke: vi.fn(async () => ({
        output: {
          decision: 'repair',
          reasonCodes: ['advisor_citation_risk'],
          unsupportedClaimIds: [],
          citationRiskEvidenceIds: ['forged-evidence-id'],
          confidence: 0.7
        },
        outputTokens: 8
      }))
    }

    await expect(
      advisor(provider).review(reviewInput(prepared))
    ).rejects.toThrow('Advisor referenced evidence outside the approved graph.')
  })

  it('preserves cancellation reason during Advisor invocation', async () => {
    const prepared = await prepareReview()
    const controller = new AbortController()
    const provider: RoleProviderAdapter<AdvisorModelInput> = {
      invoke: vi.fn(
        invocation =>
          new Promise<Readonly<{ output: unknown; outputTokens: number }>>(
            (_, reject) => {
              invocation.signal.addEventListener(
                'abort',
                () => reject(new Error('provider observed cancellation')),
                { once: true }
              )
              controller.abort(new Error('user cancelled review'))
            }
          )
      )
    }

    await expect(
      advisor(provider).review(reviewInput(prepared, controller.signal))
    ).rejects.toThrow('user cancelled review')
    expect(provider.invoke).toHaveBeenCalledTimes(1)
  })
})
