import type { EntityProviderResult } from '@/lib/ai/architecture/contracts'
import type { RouteExecutionContext } from '@/lib/ai/router/execution-context'
import type { SearchResultItem } from '@/lib/types'

import type {
  EntityMention,
  KnowledgeGraphEntity,
  ResolvedEntity
} from './entity-types'

export const ENTITY_PROVIDERS = ['wikidata', 'dbpedia'] as const

export type EntityProvider = (typeof ENTITY_PROVIDERS)[number]
export type EntityFailureClass = NonNullable<
  EntityProviderResult['failureClass']
>

export type EntityProviderSearchInput = Readonly<{
  query: string
  maxResults: number
  signal: AbortSignal
}>

export type GovernedEntityProviderPort = Readonly<{
  search(
    input: EntityProviderSearchInput
  ): Promise<readonly KnowledgeGraphEntity[]>
}>

export type EntityGroundingLimits = Readonly<{
  maxMentions: number
  maxCandidatesPerProvider: number
  maxResolvedEntities: number
  maxCanonicalIdsPerOutcome: number
  maxProviderCalls: number
  maxConcurrency: number
  perProviderTimeoutMs: number
  maxAttemptsPerProvider?: number
  baseRetryDelayMs?: number
  maxRetryDelayMs?: number
}>

export type NormalizedEntityGroundingLimits = Required<EntityGroundingLimits>

export type ProductionEntityGroundingConfiguration = Readonly<{
  executionId: string
  wikidata: GovernedEntityProviderPort
  dbpedia: GovernedEntityProviderPort
  limits: EntityGroundingLimits
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  random?: () => number
  now?: () => Date
}>

export type EntityGroundingProviderOutcome = Readonly<
  Omit<EntityProviderResult, 'canonicalIds' | 'reasonCodes'> & {
    canonicalIds: readonly string[]
    reasonCodes: readonly string[]
    attempts: number
    networkCallStarted: boolean
  }
>

export type ProductionEntityGroundingReport = Readonly<{
  routeDigest: string
  executionId: string
  mentions: readonly EntityMention[]
  outcomes: readonly EntityGroundingProviderOutcome[]
  resolvedEntities: readonly ResolvedEntity[]
  unresolvedMentionIds: readonly string[]
  ambiguousMentionIds: readonly string[]
  completed: boolean
  reasonCodes: readonly string[]
  budget: Readonly<{
    providerCallsUsed: number
    providerCallsAllowed: number
  }>
}>

export type ProductionEntityGroundingAdapter = Readonly<{
  ground(
    input: Readonly<{
      query: string
      results: readonly SearchResultItem[]
      routeContext: RouteExecutionContext
      signal?: AbortSignal
    }>
  ): Promise<ProductionEntityGroundingReport>
}>

export type ProviderTask = Readonly<{
  provider: EntityProvider
  mention: EntityMention
  mentionId: string
}>

export type ProviderExecution = Readonly<{
  outcome: EntityGroundingProviderOutcome
  candidates: readonly KnowledgeGraphEntity[]
}>

export type ClassifiedEntityFailure = Readonly<{
  failureClass: EntityFailureClass
  reasonCode: string
  retryable: boolean
}>
