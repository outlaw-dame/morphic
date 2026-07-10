import {
  applyCoordinatorRepairStateUpdate,
  createCoordinatorRepairStateSnapshot,
  type CoordinatorRepairStateSnapshot,
  type CoordinatorRepairStateUpdateResult
} from './repair-state'

export const COORDINATOR_REPAIR_SCOPE_VERSION = 1 as const

const MIN_SCOPE_ID_LENGTH = 16
const MAX_SCOPE_ID_LENGTH = 256
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/

export type CoordinatorRepairStateScope = {
  ownerScopeId: string
  executionScopeId: string
}

export type CoordinatorRepairStateEnvelope = {
  version: typeof COORDINATOR_REPAIR_SCOPE_VERSION
  ownerScopeId: string
  executionScopeId: string
  snapshot: CoordinatorRepairStateSnapshot
}

export type CoordinatorRepairStateEnvelopeCreationResult =
  | {
      status: 'created'
      envelope: CoordinatorRepairStateEnvelope
    }
  | {
      status: 'denied'
      reason: 'scope_denied'
    }

export type CoordinatorRepairStateReadResult =
  | {
      status: 'authorized'
      snapshot: CoordinatorRepairStateSnapshot
    }
  | {
      status: 'denied'
      reason: 'scope_denied'
    }

export type CoordinatorScopedRepairStateUpdateResult =
  | {
      status: 'authorized'
      envelope: CoordinatorRepairStateEnvelope
      update: CoordinatorRepairStateUpdateResult
    }
  | {
      status: 'denied'
      reason: 'scope_denied'
    }

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stableScopeId(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (
    trimmed.length < MIN_SCOPE_ID_LENGTH ||
    trimmed.length > MAX_SCOPE_ID_LENGTH ||
    CONTROL_CHARACTER_PATTERN.test(trimmed)
  ) {
    return null
  }

  return trimmed
}

function validatedScope(value: unknown): CoordinatorRepairStateScope | null {
  const input = recordValue(value)
  const ownerScopeId = stableScopeId(input?.ownerScopeId)
  const executionScopeId = stableScopeId(input?.executionScopeId)

  if (!ownerScopeId || !executionScopeId) return null

  return {
    ownerScopeId,
    executionScopeId
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length)
  let difference = left.length ^ right.length

  for (let index = 0; index < maxLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }

  return difference === 0
}

function scopesEqual(
  left: CoordinatorRepairStateScope,
  right: CoordinatorRepairStateScope
): boolean {
  const ownerEqual = constantTimeEqual(left.ownerScopeId, right.ownerScopeId)
  const executionEqual = constantTimeEqual(
    left.executionScopeId,
    right.executionScopeId
  )

  return ownerEqual && executionEqual
}

function validatedEnvelope(value: unknown): CoordinatorRepairStateEnvelope | null {
  const input = recordValue(value)
  if (input?.version !== COORDINATOR_REPAIR_SCOPE_VERSION) return null

  const scope = validatedScope(input)
  if (!scope) return null

  return {
    version: COORDINATOR_REPAIR_SCOPE_VERSION,
    ...scope,
    snapshot: createCoordinatorRepairStateSnapshot(input.snapshot)
  }
}

export function createCoordinatorRepairStateEnvelope(
  authenticatedScopeValue: unknown,
  snapshotValue?: unknown
): CoordinatorRepairStateEnvelopeCreationResult {
  const authenticatedScope = validatedScope(authenticatedScopeValue)
  if (!authenticatedScope) {
    return {
      status: 'denied',
      reason: 'scope_denied'
    }
  }

  return {
    status: 'created',
    envelope: {
      version: COORDINATOR_REPAIR_SCOPE_VERSION,
      ...authenticatedScope,
      snapshot: createCoordinatorRepairStateSnapshot(snapshotValue)
    }
  }
}

export function readCoordinatorRepairStateEnvelope(
  envelopeValue: unknown,
  authenticatedScopeValue: unknown
): CoordinatorRepairStateReadResult {
  const envelope = validatedEnvelope(envelopeValue)
  const authenticatedScope = validatedScope(authenticatedScopeValue)

  if (!envelope || !authenticatedScope || !scopesEqual(envelope, authenticatedScope)) {
    return {
      status: 'denied',
      reason: 'scope_denied'
    }
  }

  return {
    status: 'authorized',
    snapshot: envelope.snapshot
  }
}

export function applyCoordinatorRepairStateEnvelopeUpdate(
  envelopeValue: unknown,
  authenticatedScopeValue: unknown,
  updateValue: unknown
): CoordinatorScopedRepairStateUpdateResult {
  const envelope = validatedEnvelope(envelopeValue)
  const authenticatedScope = validatedScope(authenticatedScopeValue)

  if (!envelope || !authenticatedScope || !scopesEqual(envelope, authenticatedScope)) {
    return {
      status: 'denied',
      reason: 'scope_denied'
    }
  }

  const update = applyCoordinatorRepairStateUpdate(envelope.snapshot, updateValue)

  return {
    status: 'authorized',
    envelope: {
      ...envelope,
      snapshot: update.snapshot
    },
    update
  }
}
