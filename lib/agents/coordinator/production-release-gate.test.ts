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
  createProductionAdvisorAdapter,
  type PendingAdvisorReview
} from './production-advisor-adapter'
import {
  type CitationVerifierModelInput,
  createProductionCitationVerifierAdapter,
  type PendingCitationVerification
} from './production-citation-verifier-adapter'
import {
  createProductionCompositionAdapter,
  type PendingCompositionDraft
} from './production-composition-adapter'
import {
  type CoordinatorCompositionApproval,
  runGovernedResearchPipeline
} from './governed-pipeline'
import {
  authorizeProductionRelease,
  consumeProductionReleaseAuthorization,
  type ProductionReleaseAuthorization
} from './production-release-gate'

const retrievalNow = new Date('2026-07-11T12:00:00.000Z')
const query = 'Provide medical treatment guidance for a concussion'

type Prepared = Readonly<{
  routeContext: RouteExecutionContext
  evidenceGraph: EvidenceGraph
  approval: CoordinatorCompositionApproval
  composition: PendingCompositionDraft
  advisorReview: PendingAdvisorReview
  citationVerification: PendingCitationVerification
}>

function routeContext(): RouteExecutionContext {
  const routePlan = buildDeterministicRouteFloor({ query })
  return createRouteExecutionContext({
    routePlan,
    routeDigest: digestRoutePlan(routePlan)
  })
}

function scope(invocationId: string, executionId = 'execution_00000001') {
  return createTrustedRoleExecutionScope({
    ownerScopeId: 'owner_scope_00000001',
    executionId,
    invocationId,
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    allowedPermissionClasses: ['none', 'evidence_read_only']
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

function searchResult(
  context: RouteExecutionContext,
  url: string,
  pathId: string
): SearchResultItem {
  return {
    title: 'Authoritative medical source',
    url,
    content:
      'Concussion care should follow evaluation by a qualified medical professional.',
    publishedAt: '2026-07-10T12:00:00.000Z',
    retrievalProvenance: {
      routeDigest: context.routeDigest,
      pathId,
      pathPurpose: 'primary_evidence',
      sourceClass: 'government_or_regulator',
      retrievedAt: retrievalNow.toISOString()
    }
  }
}

async function prepare(options?: Readonly<{
  draft?: string
  advisorExecutionId?: string
  citationExecutionId?: string
  cited?: boolean
}>): Promise<Prepared> {
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
            options?.draft ??
            'Concussion care should follow evaluation by a qualified medical professional.',
          citedEvidenceIds:
            options?.cited === false
              ? []
              : [invocation.input.evidence[0]!.id]
        },
        outputTokens: 16
      })
    }
  })
  const signedRoute = routeContext()

  const pipeline = await runGovernedResearchPipeline({
    query,
    routeContext: signedRoute,
    retrieval: {
      retrieve: async () => ({
        searchResults: [
          searchResult(
            signedRoute,
            'https://www.cdc.gov/traumatic-brain-injury/',
            'cdc_primary'
          ),
          searchResult(
            signedRoute,
            'https://www.nih.gov/health-information/concussion',
            'nih_corroboration'
          )
        ],
        completedRoles: [
          'router',
          'retriever',
          'fusion_planner',
          'source_quality'
        ] as const,
        retrievedAt: retrievalNow
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
    now: retrievalNow
  })

  if (!approval || !evidenceGraph || !context) {
    throw new Error('Failed to capture governed state.')
  }

  const advisorAdapter = createProductionAdvisorAdapter({
    scope: scope(
      'advisor_invocation_00001',
      options?.advisorExecutionId
    ),
    candidates: [candidate('advisor')],
    provider: {
      invoke: async () => ({
        output: {
          decision: 'approve',
          reasonCodes: ['advisor_ready', 'advisor_ready'],
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

  const citationProvider: RoleProviderAdapter<CitationVerifierModelInput> = {
    invoke: vi.fn(async invocation => ({
      output: {
        decision: 'verified',
        reasonCodes: ['citations_verified'],
        verifiedEvidenceIds: [...invocation.input.citedEvidenceIds],
        unsupportedEvidenceIds: [],
        missingCitationClaimIds: [],
        confidence: 0.98
      },
      outputTokens: 10
    }))
  }
  const citationVerification =
    await createProductionCitationVerifierAdapter({
      scope: scope(
        'citation_invocation_0001',
        options?.citationExecutionId
      ),
      candidates: [candidate('citation_verifier')],
      provider: citationProvider
    }).verify({
      query,
      routeContext: context,
      evidenceGraph,
      approval,
      composition: pipeline.output,
      advisorReview
    })

  return {
    routeContext: context,
    evidenceGraph,
    approval,
    composition: pipeline.output,
    advisorReview,
    citationVerification
  }
}

function releaseInput(prepared: Prepared, releaseNow = new Date()) {
  return {
    routeContext: prepared.routeContext,
    evidenceGraph: prepared.evidenceGraph,
    approval: prepared.approval,
    composition: prepared.composition,
    advisorReview: prepared.advisorReview,
    citationVerification: prepared.citationVerification,
    now: releaseNow,
    authorizationTtlMs: 60_000
  }
}

describe('AI-I3J deterministic final release capability', () => {
  it('authorizes and consumes an exact verified chain once', async () => {
    const prepared = await prepare()
    const releaseNow = new Date()
    const authorization = authorizeProductionRelease(
      releaseInput(prepared, releaseNow)
    )

    expect(Object.isFrozen(authorization)).toBe(true)
    expect(Object.isFrozen(authorization.citedEvidenceIds)).toBe(true)
    expect(authorization.status).toBe('authorized_for_streaming')
    expect(authorization.executionId).toBe('execution_00000001')

    const released = consumeProductionReleaseAuthorization(authorization, {
      routeContext: prepared.routeContext,
      now: releaseNow
    })
    expect(released.status).toBe('released')
    expect(released.draft).toBe(prepared.composition.draft)
    expect(released.citedEvidenceIds).toEqual(
      prepared.composition.citedEvidenceIds
    )

    expect(() =>
      consumeProductionReleaseAuthorization(authorization, {
        routeContext: prepared.routeContext,
        now: releaseNow
      })
    ).toThrow('Invalid or already consumed production release authorization.')
  })

  it('rejects a structurally forged release authorization', async () => {
    const prepared = await prepare()
    const releaseNow = new Date()
    const authorization = authorizeProductionRelease(
      releaseInput(prepared, releaseNow)
    )
    const forged = { ...authorization } as ProductionReleaseAuthorization

    expect(() =>
      consumeProductionReleaseAuthorization(forged, {
        routeContext: prepared.routeContext,
        now: releaseNow
      })
    ).toThrow('Invalid or already consumed production release authorization.')
  })

  it('rejects expired release authorization and consumes it fail closed', async () => {
    const prepared = await prepare()
    const issuedAt = new Date()
    const authorization = authorizeProductionRelease({
      ...releaseInput(prepared, issuedAt),
      authorizationTtlMs: 1_000
    })
    const afterExpiry = new Date(issuedAt.getTime() + 1_001)

    expect(() =>
      consumeProductionReleaseAuthorization(authorization, {
        routeContext: prepared.routeContext,
        now: afterExpiry
      })
    ).toThrow('Production release authorization expired.')
    expect(() =>
      consumeProductionReleaseAuthorization(authorization, {
        routeContext: prepared.routeContext,
        now: issuedAt
      })
    ).toThrow('Invalid or already consumed production release authorization.')
  })

  it('rejects role results from different execution IDs', async () => {
    const prepared = await prepare({
      advisorExecutionId: 'execution_00000002',
      citationExecutionId: 'execution_00000003'
    })

    expect(() => authorizeProductionRelease(releaseInput(prepared))).toThrow(
      'Release role executions do not share one execution ID.'
    )
  })

  it('rejects reusing an Advisor approval for a different composition', async () => {
    const first = await prepare({ draft: 'First reviewed draft.' })
    const second = await prepare({ draft: 'Second unreviewed draft.' })
    const verifier = createProductionCitationVerifierAdapter({
      scope: scope('citation_invocation_0002'),
      candidates: [candidate('citation_verifier')],
      provider: {
        invoke: vi.fn()
      }
    })

    await expect(
      verifier.verify({
        query,
        routeContext: second.routeContext,
        evidenceGraph: second.evidenceGraph,
        approval: second.approval,
        composition: second.composition,
        advisorReview: first.advisorReview
      })
    ).rejects.toThrow('Advisor review did not approve this composition.')
  })

  it('rejects citation verification for an uncited research draft', async () => {
    await expect(prepare({ cited: false })).rejects.toThrow(
      'Citation verification requires at least one cited evidence item.'
    )
  })

  it('rejects a route mismatch at consumption', async () => {
    const prepared = await prepare()
    const releaseNow = new Date()
    const authorization = authorizeProductionRelease(
      releaseInput(prepared, releaseNow)
    )
    const otherPlan = buildDeterministicRouteFloor({
      query: 'Explain photosynthesis'
    })
    const otherContext = createRouteExecutionContext({
      routePlan: otherPlan,
      routeDigest: digestRoutePlan(otherPlan)
    })

    expect(() =>
      consumeProductionReleaseAuthorization(authorization, {
        routeContext: otherContext,
        now: releaseNow
      })
    ).toThrow('Production release route mismatch.')
  })
})
