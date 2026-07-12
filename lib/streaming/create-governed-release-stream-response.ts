import { randomUUID } from 'node:crypto'

import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'

import type { ReleasedProductionResponse } from '@/lib/agents/coordinator/production-release-gate'
import type { GovernedStreamRolloutDecision } from '@/lib/ai/rollout/governed-stream-rollout'
import {
  createRouteExecutionContext,
  type RouteExecutionContext
} from '@/lib/ai/router/execution-context'

const DIGEST_PATTERN = /^[a-f0-9]{64}$/
const MAX_DRAFT_LENGTH = 200_000
const MAX_CITATIONS = 500
const MAX_EVIDENCE_ID_LENGTH = 256
const MAX_TRACE_ID_LENGTH = 256

export type GovernedReleaseStreamInput = Readonly<{
  release: ReleasedProductionResponse
  routeContext: RouteExecutionContext
  rolloutDecision: GovernedStreamRolloutDecision
  traceId?: string
}>

function normalizeRelease(
  release: ReleasedProductionResponse,
  routeContext: RouteExecutionContext
): ReleasedProductionResponse {
  if (!release || typeof release !== 'object') {
    throw new Error('Invalid governed production release.')
  }
  if (
    release.status !== 'released' ||
    release.routeDigest !== routeContext.routeDigest ||
    typeof release.executionId !== 'string' ||
    release.executionId.length < 16 ||
    release.executionId.length > 128 ||
    typeof release.draft !== 'string' ||
    release.draft.trim().length === 0 ||
    release.draft.length > MAX_DRAFT_LENGTH ||
    typeof release.composerOutputDigest !== 'string' ||
    !DIGEST_PATTERN.test(release.composerOutputDigest) ||
    (release.advisorOutputDigest !== null &&
      (typeof release.advisorOutputDigest !== 'string' ||
        !DIGEST_PATTERN.test(release.advisorOutputDigest))) ||
    typeof release.citationVerifierOutputDigest !== 'string' ||
    !DIGEST_PATTERN.test(release.citationVerifierOutputDigest) ||
    typeof release.releasedAt !== 'string' ||
    !Number.isFinite(Date.parse(release.releasedAt)) ||
    !Array.isArray(release.citedEvidenceIds) ||
    release.citedEvidenceIds.length === 0 ||
    release.citedEvidenceIds.length > MAX_CITATIONS
  ) {
    throw new Error('Invalid governed production release.')
  }

  const citedEvidenceIds = Object.freeze(
    release.citedEvidenceIds.map(id => {
      if (
        typeof id !== 'string' ||
        id.length === 0 ||
        id.length > MAX_EVIDENCE_ID_LENGTH
      ) {
        throw new Error('Invalid governed production release citation.')
      }
      return id
    })
  )

  return Object.freeze({ ...release, citedEvidenceIds })
}

function assertEnforcedRollout(decision: GovernedStreamRolloutDecision): void {
  if (
    !decision ||
    typeof decision !== 'object' ||
    decision.mode !== 'enforce' ||
    decision.selected !== true
  ) {
    throw new Error(
      'Governed release stream requires enforced rollout selection.'
    )
  }
}

function normalizeTraceId(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_TRACE_ID_LENGTH ||
    /[\r\n]/.test(value)
  ) {
    throw new Error('Invalid governed release stream trace ID.')
  }
  return value
}

export function createGovernedReleaseStreamResponse(
  input: GovernedReleaseStreamInput
): Response {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid governed release stream input.')
  }

  const routeContext = createRouteExecutionContext(input.routeContext)
  assertEnforcedRollout(input.rolloutDecision)
  const release = normalizeRelease(input.release, routeContext)
  const traceId = normalizeTraceId(input.traceId)
  const messageId = randomUUID()
  const textPartId = randomUUID()

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: 'start', messageId })
      writer.write({
        type: 'start-step'
      })
      writer.write({ type: 'text-start', id: textPartId })
      writer.write({
        type: 'text-delta',
        id: textPartId,
        delta: release.draft
      })
      writer.write({ type: 'text-end', id: textPartId })
      writer.write({ type: 'finish-step' })
      writer.write({ type: 'finish' })
    }
  })

  return createUIMessageStreamResponse({
    stream,
    headers: {
      'Cache-Control': 'no-store',
      'X-Governed-Execution-Id': release.executionId,
      'X-Governed-Route-Digest': release.routeDigest,
      'X-Governed-Composer-Digest': release.composerOutputDigest,
      'X-Governed-Citation-Digest': release.citationVerifierOutputDigest,
      ...(traceId ? { 'X-Trace-Id': traceId } : {})
    }
  })
}
