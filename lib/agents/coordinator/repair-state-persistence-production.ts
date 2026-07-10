const PRODUCTION_CONTRACT_VERSION = 1 as const
const MAX_RETENTION_DAYS = 3650
const MAX_RECOVERY_WINDOW_HOURS = 168

const CONTRACT_KEYS = [
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
] as const

const CONTRACT_KEY_SET = new Set<string>(CONTRACT_KEYS)

type ContractKey = (typeof CONTRACT_KEYS)[number]

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

type ExtractedFields = Record<ContractKey, unknown>

function extractContractFields(value: unknown): ExtractedFields | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null

  try {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return null

    const keys = Object.keys(value)
    if (
      keys.length !== CONTRACT_KEYS.length ||
      keys.some(key => !CONTRACT_KEY_SET.has(key))
    ) {
      return null
    }

    const fields = Object.create(null) as ExtractedFields
    for (const key of CONTRACT_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) {
        return null
      }
      fields[key] = descriptor.value
    }

    return fields
  } catch {
    return null
  }
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
  const fields = extractContractFields(value)
  if (!fields) {
    return { status: 'rejected', reasons: ['invalid_contract_shape'] }
  }

  const reasons: CoordinatorRepairStateProductionRejectionReason[] = []

  if (fields.version !== PRODUCTION_CONTRACT_VERSION) {
    reasons.push('unsupported_contract_version')
  }
  if (fields.adapterKind !== 'transactional_database') {
    reasons.push('non_production_adapter')
  }
  if (fields.durability !== 'durable') {
    reasons.push('durability_not_guaranteed')
  }
  if (
    fields.atomicity !== 'database_compare_and_swap' &&
    fields.atomicity !== 'serializable_transaction'
  ) {
    reasons.push('atomicity_not_database_enforced')
  }
  if (fields.scopeIsolation !== 'database_enforced_owner_and_execution_scope') {
    reasons.push('scope_isolation_not_database_enforced')
  }
  if (fields.transportSecurity !== 'tls_required') {
    reasons.push('transport_security_not_required')
  }
  if (
    fields.encryptionAtRest !== 'provider_managed' &&
    fields.encryptionAtRest !== 'application_envelope_encryption'
  ) {
    reasons.push('encryption_at_rest_not_declared')
  }
  if (fields.credentialSource !== 'runtime_secret_manager') {
    reasons.push('credential_source_not_approved')
  }
  if (!safeIntegerInRange(fields.retentionDays, 1, MAX_RETENTION_DAYS)) {
    reasons.push('retention_policy_invalid')
  }
  if (fields.deletionMode !== 'revision_bound_hard_delete') {
    reasons.push('deletion_policy_not_revision_bound')
  }
  if (fields.backupMode !== 'encrypted_and_access_controlled') {
    reasons.push('backup_policy_not_approved')
  }
  if (fields.restoreTesting !== 'regularly_verified') {
    reasons.push('restore_testing_not_declared')
  }
  if (
    !safeIntegerInRange(
      fields.recoveryPointObjectiveHours,
      1,
      MAX_RECOVERY_WINDOW_HOURS
    )
  ) {
    reasons.push('recovery_objective_invalid')
  }
  if (fields.auditMode !== 'privacy_safe_security_events') {
    reasons.push('audit_policy_not_privacy_safe')
  }
  if (fields.conformanceVerified !== true) {
    reasons.push('conformance_not_verified')
  }

  if (reasons.length > 0) {
    return { status: 'rejected', reasons: Object.freeze([...reasons]) }
  }

  const contract: CoordinatorRepairStateProductionContract = {
    version: PRODUCTION_CONTRACT_VERSION,
    adapterKind: 'transactional_database',
    durability: 'durable',
    atomicity: fields.atomicity as CoordinatorRepairStateProductionContract['atomicity'],
    scopeIsolation: 'database_enforced_owner_and_execution_scope',
    transportSecurity: 'tls_required',
    encryptionAtRest:
      fields.encryptionAtRest as CoordinatorRepairStateProductionContract['encryptionAtRest'],
    credentialSource: 'runtime_secret_manager',
    retentionDays: fields.retentionDays as number,
    deletionMode: 'revision_bound_hard_delete',
    backupMode: 'encrypted_and_access_controlled',
    restoreTesting: 'regularly_verified',
    recoveryPointObjectiveHours: fields.recoveryPointObjectiveHours as number,
    auditMode: 'privacy_safe_security_events',
    conformanceVerified: true
  }

  return { status: 'approved', contract: Object.freeze(contract) }
}
