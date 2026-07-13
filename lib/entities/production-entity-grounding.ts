import {
  createRouteExecutionContext,
  type RouteExecutionContext
} from '@/lib/ai/router/execution-context'

import { extractEntityMentions } from './entity-extraction'
import { resolveEntities } from './entity-resolution'
import type {
  ClassifiedEntityFailure,
  ProductionEntityGroundingAdapter,
  ProductionEntityGroundingConfiguration,
  ProductionEntityGroundingReport,
  ProviderExecution,
  ProviderTask
} from './production-entity-grounding-contract'
import { ENTITY_PROVIDERS } from './production-entity-grounding-contract'
import {
  assertEntityProviderPort,
  boundedEntityReasonCodes,
  canonicalEntityIds,
  classifyEntityProviderFailure,
  createEntityMentionId,
  createEntityProviderOutcome,
  createEntityTimeout,
  digestEntityValue,
  entityRetryDelay,
  missingCanonicalEntityIdError,
  normalizeEntityGroundingLimits,
  sleepForEntityRetry,
  throwIfEntityGroundingAborted,
  validateEntityCandidates,
  validateEntityExecutionId
} from './production-entity-grounding-utils'
import type { ResolvedEntity } from './entity-types'

export type {
  EntityGroundingLimits,
  EntityGroundingProviderOutcome,
  GovernedEntityProviderPort,
  ProductionEntityGroundingAdapter,
  ProductionEntityGroundingConfiguration,
  ProductionEntityGroundingReport
} from './production-entity-grounding-contract'

const MAX_QUERY_LENGTH = 16_000

function normalizedEntityKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^(\p{L}|\p{N})]+/gu, ' ')
    .trim()
}

function preserveCanonicalMismatch(entity: ResolvedEntity): ResolvedEntity {
  if (!entity.dbpediaUri) return entity
  const resourceName = decodeURIComponent(
    entity.dbpediaUri.split('/').pop() ?? ''
  )
  if (
    !resourceName ||
    normalizedEntityKey(resourceName) ===
      normalizedEntityKey(entity.canonicalName)
  ) {
    return entity
  }
  return Object.freeze({
    ...entity,
    ambiguous: true,
    ambiguityReasons: Object.freeze([
      ...new Set([
        ...entity.ambiguityReasons,
        'canonical_identifier_label_mismatch'
      ])
    ])
  })
}

function matchingMentionIds(
  routeDigest: string,
  mentions: ReturnType<typeof extractEntityMentions>,
  resolvedEntities: ProductionEntityGroundingReport['resolvedEntities']
): Readonly<{
  unresolvedMentionIds: readonly string[]
  ambiguousMentionIds: readonly string[]
}> {
  const unresolvedMentionIds: string[] = []
  const ambiguousMentionIds: string[] = []

  for (const mention of mentions) {
    const id = createEntityMentionId(routeDigest, mention)
    const matching = resolvedEntities.filter(entity =>
      entity.supportingMentions.some(
        supporting =>
          supporting.normalizedText.toLowerCase() ===
          mention.normalizedText.toLowerCase()
      )
    )
    if (matching.length === 0) unresolvedMentionIds.push(id)
    if (matching.some(entity => entity.ambiguous)) {
      ambiguousMentionIds.push(id)
    }
  }
  return Object.freeze({
    unresolvedMentionIds: Object.freeze(unresolvedMentionIds),
    ambiguousMentionIds: Object.freeze(ambiguousMentionIds)
  })
}

function buildTasks(
  routeContext: RouteExecutionContext,
  mentions: ReturnType<typeof extractEntityMentions>
): readonly ProviderTask[] {
  return Object.freeze(
    mentions.flatMap(mention => {
      const mentionId = createEntityMentionId(
        routeContext.routeDigest,
        mention
      )
      return ENTITY_PROVIDERS.map(provider =>
        Object.freeze({ provider, mention, mentionId })
      )
    })
  )
}

export function createProductionEntityGroundingAdapter(
  configuration: ProductionEntityGroundingConfiguration
): ProductionEntityGroundingAdapter {
  if (!configuration || typeof configuration !== 'object') {
    throw new Error('Invalid entity grounding configuration.')
  }
  const executionId = validateEntityExecutionId(configuration.executionId)
  assertEntityProviderPort(configuration.wikidata, 'wikidata')
  assertEntityProviderPort(configuration.dbpedia, 'dbpedia')
  const limits = normalizeEntityGroundingLimits(configuration.limits)
  const sleep = configuration.sleep ?? sleepForEntityRetry
  const random = configuration.random ?? Math.random
  const now = configuration.now ?? (() => new Date())
  const ports = Object.freeze({
    wikidata: configuration.wikidata,
    dbpedia: configuration.dbpedia
  })

  return Object.freeze({
    async ground(input) {
      const query = typeof input?.query === 'string' ? input.query.trim() : ''
      if (!query || query.length > MAX_QUERY_LENGTH) {
        throw new Error('Invalid entity grounding query.')
      }
      if (!Array.isArray(input.results)) {
        throw new Error('Invalid entity grounding search results.')
      }
      const routeContext = createRouteExecutionContext(input.routeContext)
      if (!routeContext.routePlan.needsEntityGrounding) {
        throw new Error('Router did not authorize entity grounding.')
      }
      throwIfEntityGroundingAborted(input.signal)

      const mentions = Object.freeze(
        extractEntityMentions(
          query,
          [...input.results],
          limits.maxMentions
        ).map(mention => Object.freeze({ ...mention }))
      )
      const tasks = buildTasks(routeContext, mentions)
      if (tasks.length > limits.maxProviderCalls) {
        throw new Error(
          'Entity grounding provider call budget exceeded before execution.'
        )
      }

      let providerCallsUsed = 0
      let nextTaskIndex = 0
      const executions: ProviderExecution[] = []

      const executeTask = async (
        task: ProviderTask
      ): Promise<ProviderExecution> => {
        let attempts = 0
        let networkCallStarted = false
        let lastFailure: ClassifiedEntityFailure | undefined

        while (attempts < limits.maxAttemptsPerProvider) {
          throwIfEntityGroundingAborted(input.signal)
          if (providerCallsUsed >= limits.maxProviderCalls) {
            lastFailure = {
              failureClass: 'policy_violation',
              reasonCode: 'provider_call_budget_exhausted',
              retryable: false
            }
            break
          }

          providerCallsUsed += 1
          attempts += 1
          networkCallStarted = true
          const timeout = createEntityTimeout(
            input.signal,
            limits.perProviderTimeoutMs
          )
          try {
            const candidates = validateEntityCandidates(
              await ports[task.provider].search({
                query: task.mention.normalizedText,
                maxResults: limits.maxCandidatesPerProvider,
                signal: timeout.signal
              }),
              task.provider,
              limits.maxCandidatesPerProvider
            )
            const canonicalIds = canonicalEntityIds(
              candidates,
              limits.maxCanonicalIdsPerOutcome
            )
            const retrievedAt = now().toISOString()

            if (candidates.length === 0) {
              return {
                candidates,
                outcome: createEntityProviderOutcome(executionId, {
                  provider: task.provider,
                  mentionId: task.mentionId,
                  status: 'not_found',
                  canonicalIds: [],
                  resultDigest: null,
                  retrievedAt,
                  failureClass: null,
                  reasonCodes: boundedEntityReasonCodes([
                    'provider_returned_no_candidates'
                  ]),
                  attempts,
                  networkCallStarted
                })
              }
            }
            if (canonicalIds.length === 0) {
              throw missingCanonicalEntityIdError()
            }
            return {
              candidates,
              outcome: createEntityProviderOutcome(executionId, {
                provider: task.provider,
                mentionId: task.mentionId,
                status: 'succeeded',
                canonicalIds,
                resultDigest: digestEntityValue(JSON.stringify(candidates)),
                retrievedAt,
                failureClass: null,
                reasonCodes: boundedEntityReasonCodes([
                  'provider_candidates_validated'
                ]),
                attempts,
                networkCallStarted
              })
            }
          } catch (error) {
            if (input.signal?.aborted) {
              throwIfEntityGroundingAborted(input.signal)
            }
            lastFailure = timeout.timedOut()
              ? {
                  failureClass: 'timeout',
                  reasonCode: 'provider_timeout',
                  retryable: true
                }
              : classifyEntityProviderFailure(error)
            if (
              !lastFailure.retryable ||
              attempts >= limits.maxAttemptsPerProvider ||
              providerCallsUsed >= limits.maxProviderCalls
            ) {
              break
            }
            await sleep(
              entityRetryDelay(attempts, limits, random, error),
              input.signal
            )
          } finally {
            timeout.dispose()
          }
        }

        const failure =
          lastFailure ??
          ({
            failureClass: 'permanent_provider_failure',
            reasonCode: 'provider_internal_failure',
            retryable: false
          } as const)
        return {
          candidates: Object.freeze([]),
          outcome: createEntityProviderOutcome(executionId, {
            provider: task.provider,
            mentionId: task.mentionId,
            status: 'failed',
            canonicalIds: [],
            resultDigest: null,
            retrievedAt: now().toISOString(),
            failureClass: failure.failureClass,
            reasonCodes: boundedEntityReasonCodes([failure.reasonCode]),
            attempts,
            networkCallStarted
          })
        }
      }

      const worker = async () => {
        while (nextTaskIndex < tasks.length) {
          const index = nextTaskIndex
          nextTaskIndex += 1
          const task = tasks[index]
          if (!task) return
          executions[index] = await executeTask(task)
        }
      }
      await Promise.all(
        Array.from(
          {
            length: Math.min(
              limits.maxConcurrency,
              Math.max(1, tasks.length)
            )
          },
          () => worker()
        )
      )
      throwIfEntityGroundingAborted(input.signal)

      const resolvedEntities = Object.freeze(
        resolveEntities(
          [...mentions],
          executions.flatMap(execution => execution.candidates),
          limits.maxResolvedEntities
        ).map(entity => preserveCanonicalMismatch(entity))
      )
      const outcomes = Object.freeze(
        executions.map(execution => execution.outcome)
      )
      const mentionState = matchingMentionIds(
        routeContext.routeDigest,
        mentions,
        resolvedEntities
      )
      const completed =
        mentionState.unresolvedMentionIds.length === 0 &&
        mentionState.ambiguousMentionIds.length === 0 &&
        outcomes.length === tasks.length

      return Object.freeze({
        routeDigest: routeContext.routeDigest,
        executionId,
        mentions,
        outcomes,
        resolvedEntities,
        unresolvedMentionIds: mentionState.unresolvedMentionIds,
        ambiguousMentionIds: mentionState.ambiguousMentionIds,
        completed,
        reasonCodes: boundedEntityReasonCodes([
          completed
            ? 'entity_grounding_completed'
            : 'entity_grounding_blocked',
          ...(mentionState.unresolvedMentionIds.length > 0
            ? ['required_entity_unresolved']
            : []),
          ...(mentionState.ambiguousMentionIds.length > 0
            ? ['required_entity_ambiguous']
            : [])
        ]),
        budget: Object.freeze({
          providerCallsUsed,
          providerCallsAllowed: limits.maxProviderCalls
        })
      })
    }
  })
}
