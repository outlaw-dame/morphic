import type { CoordinatorAdmissionRepairExecutorState } from './admission'
import type { CoordinatorRepairRetryPolicy } from './repair-executor'

export const COORDINATOR_REPAIR_STATE_VERSION = 1 as const
export const MAX_REPAIR_STATE_ENTRIES = 64

const MAX_REPAIR_STATE_ID_LENGTH = 256
const DEFAULT_MAX_ATTEMPTS_PER_STEP = 2
const MAX_ATTEMPTS_PER_STEP_CAP = 5
const DEFAULT_BASE_DELAY_MS = 1000
const DEFAULT_MAX_DELAY_MS = 30_000
const MAX_DELAY_MS_CAP = 300_000

export type CoordinatorRepairStateSnapshot = {
  version: typeof COORDINATOR_REPAIR_STATE_VERSION
  revision: number
  completedStepIds: string[]
  priorAttemptsByStepId: Record<string, number>
  retryPolicy: CoordinatorRepairRetryPolicy
}

export type CoordinatorRepairStateUpdate = {
  expectedRevision: number
  completedStepIds?: unknown
  priorAttemptsByStepId?: unknown
  retryPolicy?: unknown
}

export type CoordinatorRepairStateUpdateResult =
  | {
      status: 'applied'
      snapshot: CoordinatorRepairStateSnapshot
    }
  | {
      status: 'noop'
      snapshot: CoordinatorRepairStateSnapshot
    }
  | {
      status: 'conflict'
      reason: 'revision_conflict' | 'revision_exhausted'
      snapshot: CoordinatorRepairStateSnapshot
    }

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function boundedNonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback
}

function boundedPositiveInteger(
  value: unknown,
  fallback: number,
  cap: number
): number {
  return Math.min(cap, Math.max(1, boundedNonNegativeInteger(value, fallback)))
}

function strictRevision(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null
}

function stableId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_REPAIR_STATE_ID_LENGTH) {
    return null
  }
  return trimmed
}

function safeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const ids = new Set<string>()
  for (const item of value) {
    const id = stableId(item)
    if (id) ids.add(id)
    if (ids.size >= MAX_REPAIR_STATE_ENTRIES) break
  }

  return [...ids].sort()
}

function safeAttempts(
  value: unknown,
  preferredIds: ReadonlySet<string> = new Set()
): Record<string, number> {
  const input = recordValue(value)
  if (!input) return {}

  const entries = Object.entries(input).sort(([rawA], [rawB]) => {
    const idA = stableId(rawA)
    const idB = stableId(rawB)
    const preferredA = idA ? preferredIds.has(idA) : false
    const preferredB = idB ? preferredIds.has(idB) : false

    if (preferredA !== preferredB) return preferredA ? -1 : 1
    return rawA.localeCompare(rawB)
  })
  const attemptsById = new Map<string, number>()

  for (const [rawId, rawAttempts] of entries) {
    const id = stableId(rawId)
    if (!id) continue
    if (!attemptsById.has(id) && attemptsById.size >= MAX_REPAIR_STATE_ENTRIES) {
      continue
    }

    const attempts = Math.min(
      MAX_ATTEMPTS_PER_STEP_CAP,
      boundedNonNegativeInteger(rawAttempts, 0)
    )
    attemptsById.set(id, Math.max(attemptsById.get(id) ?? 0, attempts))
  }

  return Object.fromEntries(
    [...attemptsById.entries()].sort(([a], [b]) => a.localeCompare(b))
  )
}

function safeRetryPolicy(value: unknown): CoordinatorRepairRetryPolicy {
  const input = recordValue(value)
  const maxAttemptsPerStep = boundedPositiveInteger(
    input?.maxAttemptsPerStep,
    DEFAULT_MAX_ATTEMPTS_PER_STEP,
    MAX_ATTEMPTS_PER_STEP_CAP
  )
  const baseDelayMs = boundedPositiveInteger(
    input?.baseDelayMs,
    DEFAULT_BASE_DELAY_MS,
    MAX_DELAY_MS_CAP
  )
  const maxDelayMs = Math.max(
    baseDelayMs,
    boundedPositiveInteger(
      input?.maxDelayMs,
      DEFAULT_MAX_DELAY_MS,
      MAX_DELAY_MS_CAP
    )
  )

  return {
    maxAttemptsPerStep,
    baseDelayMs,
    maxDelayMs
  }
}

export function createCoordinatorRepairStateSnapshot(
  value?: unknown
): CoordinatorRepairStateSnapshot {
  const input = recordValue(value)
  const version = input?.version

  if (version !== undefined && version !== COORDINATOR_REPAIR_STATE_VERSION) {
    return createCoordinatorRepairStateSnapshot()
  }

  return {
    version: COORDINATOR_REPAIR_STATE_VERSION,
    revision: Math.min(
      Number.MAX_SAFE_INTEGER,
      boundedNonNegativeInteger(input?.revision, 0)
    ),
    completedStepIds: safeIds(input?.completedStepIds),
    priorAttemptsByStepId: safeAttempts(input?.priorAttemptsByStepId),
    retryPolicy: safeRetryPolicy(input?.retryPolicy)
  }
}

export function toCoordinatorAdmissionRepairExecutorState(
  value: unknown
): CoordinatorAdmissionRepairExecutorState {
  const snapshot = createCoordinatorRepairStateSnapshot(value)

  return {
    completedStepIds: snapshot.completedStepIds,
    priorAttemptsByStepId: snapshot.priorAttemptsByStepId,
    maxAttemptsPerStep: snapshot.retryPolicy.maxAttemptsPerStep,
    baseDelayMs: snapshot.retryPolicy.baseDelayMs,
    maxDelayMs: snapshot.retryPolicy.maxDelayMs
  }
}

function mergeIds(current: string[], incoming: string[]): string[] {
  const merged = new Set(current)
  for (const id of incoming) {
    if (merged.size >= MAX_REPAIR_STATE_ENTRIES && !merged.has(id)) break
    merged.add(id)
  }
  return [...merged].sort()
}

function mergeAttempts(
  current: Record<string, number>,
  incoming: Record<string, number>
): Record<string, number> {
  const merged = new Map(Object.entries(current))

  for (const [id, attempts] of Object.entries(incoming)) {
    if (!merged.has(id) && merged.size >= MAX_REPAIR_STATE_ENTRIES) continue
    merged.set(id, Math.max(merged.get(id) ?? 0, attempts))
  }

  return Object.fromEntries([...merged.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

function snapshotsEqual(
  left: CoordinatorRepairStateSnapshot,
  right: Omit<CoordinatorRepairStateSnapshot, 'revision'>
): boolean {
  return (
    JSON.stringify(left.completedStepIds) === JSON.stringify(right.completedStepIds) &&
    JSON.stringify(left.priorAttemptsByStepId) ===
      JSON.stringify(right.priorAttemptsByStepId) &&
    JSON.stringify(left.retryPolicy) === JSON.stringify(right.retryPolicy)
  )
}

export function applyCoordinatorRepairStateUpdate(
  currentValue: unknown,
  updateValue: unknown
): CoordinatorRepairStateUpdateResult {
  const current = createCoordinatorRepairStateSnapshot(currentValue)
  const update = recordValue(updateValue)
  const expectedRevision = strictRevision(update?.expectedRevision)

  if (expectedRevision === null || expectedRevision !== current.revision) {
    return {
      status: 'conflict',
      reason: 'revision_conflict',
      snapshot: current
    }
  }

  if (current.revision >= Number.MAX_SAFE_INTEGER) {
    return {
      status: 'conflict',
      reason: 'revision_exhausted',
      snapshot: current
    }
  }

  const completedStepIds = mergeIds(
    current.completedStepIds,
    safeIds(update?.completedStepIds)
  )
  const priorAttemptsByStepId = mergeAttempts(
    current.priorAttemptsByStepId,
    safeAttempts(
      update?.priorAttemptsByStepId,
      new Set(Object.keys(current.priorAttemptsByStepId))
    )
  )
  for (const completedStepId of completedStepIds) {
    priorAttemptsByStepId[completedStepId] = Math.max(
      1,
      priorAttemptsByStepId[completedStepId] ?? 0
    )
  }

  const nextWithoutRevision = {
    version: COORDINATOR_REPAIR_STATE_VERSION,
    completedStepIds,
    priorAttemptsByStepId,
    retryPolicy:
      update && Object.prototype.hasOwnProperty.call(update, 'retryPolicy')
        ? safeRetryPolicy(update.retryPolicy)
        : current.retryPolicy
  }

  if (snapshotsEqual(current, nextWithoutRevision)) {
    return {
      status: 'noop',
      snapshot: current
    }
  }

  return {
    status: 'applied',
    snapshot: {
      ...nextWithoutRevision,
      revision: current.revision + 1
    }
  }
}
