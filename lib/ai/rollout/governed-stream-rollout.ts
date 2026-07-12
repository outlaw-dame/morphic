import { createHash } from 'node:crypto'

const MAX_COHORT_KEY_LENGTH = 512
const MIN_SALT_LENGTH = 32
const MAX_SALT_LENGTH = 512
const ROUTE_DIGEST_PATTERN = /^[a-f0-9]{64}$/

export type GovernedStreamRolloutMode = 'off' | 'shadow' | 'enforce'

export type GovernedStreamRolloutDecision = Readonly<{
  mode: GovernedStreamRolloutMode
  selected: boolean
  percentage: number
  bucket: number
  cohortId: string
}>

export const GOVERNED_STREAM_ROLLOUT_DISABLED: GovernedStreamRolloutDecision =
  Object.freeze({
    mode: 'off',
    selected: false,
    percentage: 0,
    bucket: 0,
    cohortId: 'disabled'
  })

type Environment = Readonly<Record<string, string | undefined>>

function readMode(environment: Environment): GovernedStreamRolloutMode {
  const raw = environment.AI_GOVERNED_STREAM_MODE?.trim().toLowerCase() || 'off'
  if (raw === 'off' || raw === 'shadow' || raw === 'enforce') return raw
  throw new Error('Invalid governed stream rollout mode.')
}

function readPercentage(
  environment: Environment,
  mode: GovernedStreamRolloutMode
): number {
  const raw = environment.AI_GOVERNED_STREAM_PERCENT?.trim()
  if (mode === 'off' && !raw) return 0
  if (!raw || !/^\d{1,3}$/.test(raw)) {
    throw new Error('Invalid governed stream rollout percentage.')
  }
  const percentage = Number(raw)
  if (!Number.isSafeInteger(percentage) || percentage < 0 || percentage > 100) {
    throw new Error('Invalid governed stream rollout percentage.')
  }
  return percentage
}

function readSalt(environment: Environment, percentage: number): string {
  const salt = environment.AI_GOVERNED_STREAM_SALT ?? ''
  if (percentage === 0) return ''
  if (salt.length < MIN_SALT_LENGTH || salt.length > MAX_SALT_LENGTH) {
    throw new Error('Invalid governed stream rollout salt.')
  }
  return salt
}

function readCohortKey(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid governed stream cohort key.')
  }
  const cohortKey = value.trim()
  if (!cohortKey || cohortKey.length > MAX_COHORT_KEY_LENGTH) {
    throw new Error('Invalid governed stream cohort key.')
  }
  return cohortKey
}

function readRouteDigest(value: unknown): string {
  if (typeof value !== 'string' || !ROUTE_DIGEST_PATTERN.test(value)) {
    throw new Error('Invalid governed stream route digest.')
  }
  return value
}

export function decideGovernedStreamRollout(
  input: Readonly<{
    cohortKey: unknown
    routeDigest: unknown
    environment?: Environment
  }>
): GovernedStreamRolloutDecision {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid governed stream rollout input.')
  }

  const environment = input.environment ?? process.env
  const mode = readMode(environment)
  const percentage = readPercentage(environment, mode)
  const cohortKey = readCohortKey(input.cohortKey)
  const routeDigest = readRouteDigest(input.routeDigest)
  const salt = readSalt(environment, percentage)

  if (mode === 'off' && percentage === 0) {
    return GOVERNED_STREAM_ROLLOUT_DISABLED
  }
  if (percentage === 0) {
    return Object.freeze({
      mode,
      selected: false,
      percentage,
      bucket: 0,
      cohortId: 'disabled'
    })
  }

  const digest = createHash('sha256')
    .update(salt)
    .update('\0')
    .update(cohortKey)
    .update('\0')
    .update(routeDigest)
    .digest('hex')
  const bucket = Number.parseInt(digest.slice(0, 8), 16) % 10_000
  const selected = bucket < percentage * 100

  return Object.freeze({
    mode,
    selected,
    percentage,
    bucket,
    cohortId: digest.slice(0, 16)
  })
}

export function assertLegacyResearchStreamAllowed(
  decision: GovernedStreamRolloutDecision
): void {
  if (!decision || typeof decision !== 'object') {
    throw new Error('Invalid governed stream rollout decision.')
  }
  if (decision.mode === 'enforce' && decision.selected) {
    throw new Error(
      'Governed stream enforcement selected without an approved release.'
    )
  }
}
