const PRODUCTION_CONTRACT_VERSION = 1 as const
const MAX_RETENTION_DAYS = 3650
const MAX_RECOVERY_WINDOW_HOURS = 168

const CONTRACT_KEYS = new Set([
  'version',
  'adapterKind',
  'durability',
  'atomicity',
  'scopeIsolation',
  'transportSecurity',
  'encryptionAtRest',
  'credentialSource',
  'retentionDays',
  'deletionMode',
  'backupMode',
  'restoreTesting',
  'recoveryPointObjectiveHours',
  'auditMode',
  'conformanceVerified'
])

export type CoordinatorRepairStateProductionContract = {
  version: typeof PRODUCTION_CONTRACT_VERSION
  adapterKind: 'transactional_database'
  durability: 'durable'
  atomicity: 'database_compare_and_swap' | 'serializable_transaction'
  scopeIsolation: 'database_enforced_owner_and_execution_scope'
  transportSecurity: 'tls_required'
  encryptionAtRest: 'provider_managed' | 'application_envelope_encryption'
  credentialSource: 'runtime_secret_manager'
  retentionDays: number
  deletionMode: 'revision_bound_hard_delete'
  backupMode: 'encrypted_and_access_controlled'
  restoreTesting: 'regularly_verified'
  recoveryPointObjectiveHours: number
  auditMode: 'privacy_safe_security_events'
  conformanceVerified: true
}

export type CoordinatorRepairStateProductionRejectionReason =
  | 'invalid_contract_shape'
  | 'unsupported_contract_version'
  | 'non_production_adapter'
  | 'durability_not_guaranteed'
  | 'atomicity_not_database_enforced'
  | 'scope_isolation_not_database_enforced'
  | 'transport_security_not_required'
  | 'encryption_at_rest_not_declared'
  | 'credential_source_not_approved'
  | 'retention_policy_invalid'
  | 'deletion_policy_not_revision_bound'
  | 'backup_policy_not_approved'
  | 'restore_testing_not_declared'
  | 'recovery_objective_invalid'
  | 'audit_policy_not_privacy_safe'
  | 'conformance_not_verified'

export type CoordinatorRepairStateProductionContractResult =
  | {
      status: 'approved'
      contract: Readonly<CoordinatorRepairStateProductionContract>
    }
  | {
      status: 'rejected'
      reasons: readonly CoordinatorRepairStateProductionRejectionReason[]
    }

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function readOwnDataProperty(
  record: Record<string, unknown>,
  key: string
): { present: boolean; value?: unknown } {
  const descriptor = Object.getOwnPropertyDescriptor(record, key)
  if (!descriptor) return { present: false }
  if (!('value' in descriptor)) return { present: false }
  return { present: true, value: descriptor.value }
}

function safeIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  )
}

export function validateCoordinatorRepairStateProductionContract(
  value: unknown
): CoordinatorRepairStateProductionContractResult {
  if (!isPlainRecord(value)) {
    return { status: 'rejected', reasons: ['invalid_contract_shape'] }
  }

  let keys: string[]
  try {
    keys = Object.keys(value)
  } catch {
    return { status: 'rejected', reasons: ['invalid_contract_shape'] }
  }

  if (keys.length !== CONTRACT_KEYS.size || keys.some(key => !CONTRACT_KEYS.has(key))) {
    return { status: 'rejected', reasons: ['invalid_contract_shape'] }
  }

  const fields = Object.fromEntries(
    [...CONTRACT_KEYS].map(key => [key, readOwnDataProperty(value, key)])
  ) as Record<string, { present: boolean; value?: unknown }>

  if (Object.values(fields).some(field => !field.present)) {
    return { status: 'rejected', reasons: ['invalid_contract_shape'] }
  }

  const reasons: CoordinatorRepairStateProductionRejectionReason[] = []
  const field = (key: string): unknown => fields[key]?.value

  if (field('version') !== PRODUCTION_CONTRACT_VERSION) {
    reasons.push('unsupported_contract_version')
  }
  if (field('adapterKind') !== 'transactional_database') {
    reasons.push('non_production_adapter')
  }
  if (field('durability') !== 'durable') {
    reasons.push('durability_not_guaranteed')
  }
  if (
    field('atomicity') !== 'database_compare_and_swap' &&
    field('atomicity') !== 'serializable_transaction'
  ) {
    reasons.push('atomicity_not_database_enforced')
  }
  if (field('scopeIsolation') !== 'database_enforced_owner_and_execution_scope') {
    reasons.push('scope_isolation_not_database_enforced')
  }
  if (field('transportSecurity') !== 'tls_required') {
    reasons.push('transport_security_not_required')
  }
  if (
    field('encryptionAtRest') !== 'provider_managed' &&
    field('encryptionAtRest') !== 'application_envelope_encryption'
  ) {
    reasons.push('encryption_at_rest_not_declared')
  }
  if (field('credentialSource') !== 'runtime_secret_manager') {
    reasons.push('credential_source_not_approved')
  }
  if (!safeIntegerInRange(field('retentionDays'), 1, MAX_RETENTION_DAYS)) {
    reasons.push('retention_policy_invalid')
  }
  if (field('deletionMode') !== 'revision_bound_hard_delete') {
    reasons.push('deletion_policy_not_revision_bound')
  }
  if (field('backupMode') !== 'encrypted_and_access_controlled') {
    reasons.push('backup_policy_not_approved')
  }
  if (field('restoreTesting') !== 'regularly_verified') {
    reasons.push('restore_testing_not_declared')
  }
  if (
    !safeIntegerInRange(
      field('recoveryPointObjectiveHours'),
      1,
      MAX_RECOVERY_WINDOW_HOURS
    )
  ) {
    reasons.push('recovery_objective_invalid')
  }
  if (field('auditMode') !== 'privacy_safe_security_events') {
    reasons.push('audit_policy_not_privacy_safe')
  }
  if (field('conformanceVerified') !== true) {
    reasons.push('conformance_not_verified')
  }

  if (reasons.length > 0) {
    return { status: 'rejected', reasons: Object.freeze([...reasons]) }
  }

  const contract: CoordinatorRepairStateProductionContract = {
    version: PRODUCTION_CONTRACT_VERSION,
    adapterKind: 'transactional_database',
    durability: 'durable',
    atomicity: field('atomicity') as CoordinatorRepairStateProductionContract['atomicity'],
    scopeIsolation: 'database_enforced_owner_and_execution_scope',
    transportSecurity: 'tls_required',
    encryptionAtRest:
      field('encryptionAtRest') as CoordinatorRepairStateProductionContract['encryptionAtRest'],
    credentialSource: 'runtime_secret_manager',
    retentionDays: field('retentionDays') as number,
    deletionMode: 'revision_bound_hard_delete',
    backupMode: 'encrypted_and_access_controlled',
    restoreTesting: 'regularly_verified',
    recoveryPointObjectiveHours: field('recoveryPointObjectiveHours') as number,
    auditMode: 'privacy_safe_security_events',
    conformanceVerified: true
  }

  return { status: 'approved', contract: Object.freeze(contract) }
}
