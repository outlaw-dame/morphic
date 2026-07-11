import type { EvidenceGraph } from '@/lib/ai-architecture/evidence'
import type { RouteExecutionContext } from '@/lib/ai/router/execution-context'
import type { ModelRole } from '@/lib/ai/schemas'
import type { SearchResultItem } from '@/lib/types'

import { coordinateExecution, type CoordinatorEvaluation } from './coordinator'
import { createCoordinatorExecutionState } from './execution-state'
import {
  evaluateLiveCoordinatorHandoff,
  type LiveCoordinatorHandoffResult
} from './live-handoff'

const MAX_PIPELINE_RETRIEVAL_ATTEMPTS = 3

export type RetrievalStageInput = Readonly<{
  query: string
  routeContext: RouteExecutionContext
  attempt: number
  repairActions: readonly string[]
  signal?: AbortSignal
}>

export type RetrievalStageOutput = Readonly<{
  searchResults: readonly SearchResultItem[]
  completedRoles: readonly ModelRole[]
  retrievedAt?: string | Date | null
}>

export type CompositionStageInput = Readonly<{
  query: string
  routeContext: RouteExecutionContext
  evidenceGraph: EvidenceGraph
  coordinatorEvaluation: CoordinatorEvaluation
  signal?: AbortSignal
}>

export type CompositionStageOutput<T> = Readonly<{
  output: T
  completedRoles: readonly ModelRole[]
}>

export type GovernedResearchPipelineInput<T> = Readonly<{
  query: string
  routeContext: RouteExecutionContext
  retrieve: (input: RetrievalStageInput) => Promise<RetrievalStageOutput>
  compose: (input: CompositionStageInput) => Promise<CompositionStageOutput<T>>
  maxRetrievalAttempts?: number
  signal?: AbortSignal
  now?: Date
}>

export type GovernedResearchPipelineBlocked = Readonly<{
  status: 'blocked'
  phase: 'pre_composition' | 'pre_release'
  attempts: number
  evaluation: CoordinatorEvaluation
  repairActions: readonly string[]
}>

export type GovernedResearchPipelineReleased<T> = Readonly<{
  status: 'released'
  attempts: number
  output: T
  preComposition: CoordinatorEvaluation
  preRelease: CoordinatorEvaluation
}>

export type GovernedResearchPipelineResult<T> =
  | GovernedResearchPipelineBlocked
  | GovernedResearchPipelineReleased<T>

type DataRecord = Record<PropertyKey, unknown>

function readOwnDataProperty(record: DataRecord, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key)
  if (!descriptor || !('value' in descriptor)) {
    throw new Error('Invalid governed pipeline adapter output.')
  }
  return descriptor.value
}

function requireAdapterRecord(value: unknown): DataRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid governed pipeline adapter output.')
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('Invalid governed pipeline adapter output.')
  }
  return value as DataRecord
}

function validateRetrievalOutput(value: unknown): RetrievalStageOutput {
  const record = requireAdapterRecord(value)
  const searchResults = readOwnDataProperty(record, 'searchResults')
  const completedRoles = readOwnDataProperty(record, 'completedRoles')
  const retrievedAt = Object.hasOwn(record, 'retrievedAt')
    ? readOwnDataProperty(record, 'retrievedAt')
    : undefined

  if (!Array.isArray(searchResults) || !Array.isArray(completedRoles)) {
    throw new Error('Invalid governed retrieval adapter output.')
  }
  if (
    retrievedAt !== undefined &&
    retrievedAt !== null &&
    !(retrievedAt instanceof Date) &&
    typeof retrievedAt !== 'string'
  ) {
    throw new Error('Invalid governed retrieval adapter output.')
  }

  return {
    searchResults: searchResults as SearchResultItem[],
    completedRoles: completedRoles as ModelRole[],
    retrievedAt
  }
}

function validateCompositionOutput<T>(value: unknown): CompositionStageOutput<T> {
  const record = requireAdapterRecord(value)
  const output = readOwnDataProperty(record, 'output') as T
  const completedRoles = readOwnDataProperty(record, 'completedRoles')
  if (!Array.isArray(completedRoles)) {
    throw new Error('Invalid governed composition adapter output.')
  }
  return {
    output,
    completedRoles: completedRoles as ModelRole[]
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException('The governed research pipeline was aborted.', 'AbortError')
  }
}

function normalizeAttemptLimit(value: number | undefined): number {
  if (value === undefined) return 2
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('Invalid retrieval attempt limit.')
  }
  return Math.min(value, MAX_PIPELINE_RETRIEVAL_ATTEMPTS)
}

function hasRetrievalRepair(actions: readonly string[]): boolean {
  return actions.some(
    action =>
      action.startsWith('retrieve_') ||
      action === 'run_retriever' ||
      action === 'run_fusion_planner' ||
      action === 'run_source_quality' ||
      action === 'run_entity_grounding'
  )
}

export async function runGovernedResearchPipeline<T>(
  input: GovernedResearchPipelineInput<T>
): Promise<GovernedResearchPipelineResult<T>> {
  const maxAttempts = normalizeAttemptLimit(input.maxRetrievalAttempts)
  const now = input.now ?? new Date()
  let repairActions: readonly string[] = Object.freeze([])
  let approvedHandoff: LiveCoordinatorHandoffResult | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(input.signal)
    const retrieval = validateRetrievalOutput(
      await input.retrieve({
        query: input.query,
        routeContext: input.routeContext,
        attempt,
        repairActions,
        signal: input.signal
      })
    )
    throwIfAborted(input.signal)

    const handoff = evaluateLiveCoordinatorHandoff({
      routeContext: input.routeContext,
      query: input.query,
      searchResults: retrieval.searchResults,
      completedRoles: retrieval.completedRoles,
      retrievalAttempts: attempt,
      maxRetrievalAttempts: maxAttempts,
      retrievedAt: retrieval.retrievedAt,
      now
    })
    repairActions = Object.freeze([
      ...handoff.evaluation.repairPlan.actions
    ])
    const shouldRetryRetrieval =
      attempt < maxAttempts && hasRetrievalRepair(repairActions)

    if (
      handoff.evaluation.repairPlan.canProceedToComposition &&
      !shouldRetryRetrieval
    ) {
      approvedHandoff = handoff
      break
    }

    if (!handoff.evaluation.repairPlan.canProceedToComposition) {
      if (attempt === maxAttempts || !shouldRetryRetrieval) {
        return Object.freeze({
          status: 'blocked',
          phase: 'pre_composition',
          attempts: attempt,
          evaluation: handoff.evaluation,
          repairActions
        })
      }
    }
  }

  if (!approvedHandoff) {
    throw new Error('Coordinator approval state was not established.')
  }

  throwIfAborted(input.signal)
  const composition = validateCompositionOutput<T>(
    await input.compose({
      query: input.query,
      routeContext: approvedHandoff.routeContext,
      evidenceGraph: approvedHandoff.state.evidenceGraph,
      coordinatorEvaluation: approvedHandoff.evaluation,
      signal: input.signal
    })
  )
  throwIfAborted(input.signal)

  const completedRoles = [
    ...new Set([
      ...approvedHandoff.state.completedRoles,
      ...composition.completedRoles
    ])
  ]
  const releaseState = createCoordinatorExecutionState({
    routePlan: approvedHandoff.routeContext.routePlan,
    evidenceGraph: approvedHandoff.state.evidenceGraph,
    retrievalAttempts: approvedHandoff.state.retrievalAttempts,
    maxRetrievalAttempts: approvedHandoff.state.maxRetrievalAttempts,
    completedRoles,
    stage: 'post_composition_pre_release'
  })
  const preRelease = coordinateExecution(releaseState, now)

  if (!preRelease.repairPlan.canProceedToComposition) {
    return Object.freeze({
      status: 'blocked',
      phase: 'pre_release',
      attempts: approvedHandoff.state.retrievalAttempts,
      evaluation: preRelease,
      repairActions: Object.freeze([...preRelease.repairPlan.actions])
    })
  }

  return Object.freeze({
    status: 'released',
    attempts: approvedHandoff.state.retrievalAttempts,
    output: composition.output,
    preComposition: approvedHandoff.evaluation,
    preRelease
  })
}
