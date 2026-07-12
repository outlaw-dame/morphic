import type { RouteExecutionContext } from '@/lib/ai/router/execution-context'

import type { GovernedStreamRolloutDecision } from './governed-stream-rollout'

export type GovernedStreamPath = 'quick' | 'legacy' | 'shadow' | 'governed'

export type GovernedStreamExecutionResult<T> = Readonly<{
  path: GovernedStreamPath
  value: T
}>

export type GovernedShadowOutcome = Readonly<{
  routeDigest: string
  cohortId: string
  status: 'succeeded' | 'failed' | 'cancelled'
  durationMs: number
  errorClass: string | null
}>

export type GovernedStreamExecutorInput<T> = Readonly<{
  routeContext: RouteExecutionContext
  rolloutDecision: GovernedStreamRolloutDecision
  signal?: AbortSignal
  executeLegacy: () => Promise<T>
  executeGoverned: () => Promise<T>
  onShadowOutcome?: (outcome: GovernedShadowOutcome) => void | Promise<void>
  now?: () => number
}>

function readNow(now?: () => number): () => number {
  if (now === undefined) return Date.now
  if (typeof now !== 'function') {
    throw new Error('Invalid governed stream clock.')
  }
  return () => {
    const value = now()
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('Invalid governed stream clock value.')
    }
    return value
  }
}

function cancellationError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) return signal.reason
  const message =
    typeof signal?.reason === 'string'
      ? signal.reason
      : 'The governed stream operation was aborted.'
  return typeof DOMException !== 'undefined'
    ? new DOMException(message, 'AbortError')
    : Object.assign(new Error(message), { name: 'AbortError' })
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancellationError(signal)
}

function readErrorClass(error: unknown): string {
  if (
    error instanceof Error &&
    typeof error.name === 'string' &&
    error.name.length > 0
  ) {
    return error.name.slice(0, 128)
  }
  return 'UnknownError'
}

function assertExecutorInput<T>(
  input: GovernedStreamExecutorInput<T>
): asserts input is GovernedStreamExecutorInput<T> {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid governed stream executor input.')
  }
  if (!input.routeContext || typeof input.routeContext !== 'object') {
    throw new Error('Invalid governed stream route context.')
  }
  if (!input.rolloutDecision || typeof input.rolloutDecision !== 'object') {
    throw new Error('Invalid governed stream rollout decision.')
  }
  if (
    typeof input.executeLegacy !== 'function' ||
    typeof input.executeGoverned !== 'function'
  ) {
    throw new Error('Invalid governed stream executor callbacks.')
  }
  if (
    input.onShadowOutcome !== undefined &&
    typeof input.onShadowOutcome !== 'function'
  ) {
    throw new Error('Invalid governed shadow observer.')
  }
}

async function observeShadow(
  observer: GovernedStreamExecutorInput<unknown>['onShadowOutcome'],
  outcome: GovernedShadowOutcome
): Promise<void> {
  if (!observer) return
  try {
    await observer(outcome)
  } catch {
    // Observability must never change the user-visible execution path.
  }
}

export async function executeGovernedStream<T>(
  input: GovernedStreamExecutorInput<T>
): Promise<GovernedStreamExecutionResult<T>> {
  assertExecutorInput(input)
  const now = readNow(input.now)
  throwIfAborted(input.signal)

  const route = input.routeContext.routePlan
  const decision = input.rolloutDecision

  if (!route.requiresResearch) {
    const value = await input.executeLegacy()
    return Object.freeze({ path: 'quick' as const, value })
  }

  if (!decision.selected || decision.mode === 'off') {
    const value = await input.executeLegacy()
    return Object.freeze({ path: 'legacy' as const, value })
  }

  if (decision.mode === 'enforce') {
    const value = await input.executeGoverned()
    throwIfAborted(input.signal)
    return Object.freeze({ path: 'governed' as const, value })
  }

  if (decision.mode !== 'shadow') {
    throw new Error('Invalid governed stream rollout mode.')
  }

  const startedAt = now()
  let shadowStatus: GovernedShadowOutcome['status'] = 'succeeded'
  let errorClass: string | null = null

  try {
    await input.executeGoverned()
  } catch (error) {
    shadowStatus = input.signal?.aborted ? 'cancelled' : 'failed'
    errorClass = readErrorClass(error)
  }

  const durationMs = Math.max(0, now() - startedAt)
  await observeShadow(
    input.onShadowOutcome,
    Object.freeze({
      routeDigest: input.routeContext.routeDigest,
      cohortId: decision.cohortId,
      status: shadowStatus,
      durationMs,
      errorClass
    })
  )

  throwIfAborted(input.signal)
  const value = await input.executeLegacy()
  return Object.freeze({ path: 'shadow' as const, value })
}
