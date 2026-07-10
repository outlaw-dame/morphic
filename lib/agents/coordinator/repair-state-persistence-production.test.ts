import { describe, expect, it } from 'vitest'

import {
  validateCoordinatorRepairStateProductionContract,
  type CoordinatorRepairStateProductionContract
} from './repair-state-persistence-production'

function validContract(
  overrides: Partial<CoordinatorRepairStateProductionContract> = {}
): CoordinatorRepairStateProductionContract {
  return {
    version: 1,
    adapterKind: 'transactional_database',
    durability: 'durable',
    atomicity: 'database_compare_and_swap',
    scopeIsolation: 'database_enforced_owner_and_execution_scope',
    transportSecurity: 'tls_required',
    encryptionAtRest: 'provider_managed',
    credentialSource: 'runtime_secret_manager',
    retentionDays: 30,
    deletionMode: 'revision_bound_hard_delete',
    backupMode: 'encrypted_and_access_controlled',
    restoreTesting: 'regularly_verified',
    recoveryPointObjectiveHours: 24,
    auditMode: 'privacy_safe_security_events',
    conformanceVerified: true,
    ...overrides
  }
}

describe('Coordinator production repair-state persistence contract', () => {
  it('approves a complete contract and returns an immutable normalized copy', () => {
    const input = validContract()
    const result = validateCoordinatorRepairStateProductionContract(input)

    expect(result.status).toBe('approved')
    if (result.status !== 'approved') throw new Error('expected approved contract')

    expect(result.contract).toEqual(input)
    expect(result.contract).not.toBe(input)
    expect(Object.isFrozen(result.contract)).toBe(true)
  })

  it('rejects the in-memory adapter and every missing production guarantee', () => {
    const result = validateCoordinatorRepairStateProductionContract({
      ...validContract(),
      adapterKind: 'in_memory',
      durability: 'best_effort',
      atomicity: 'process_local',
      scopeIsolation: 'application_only',
      transportSecurity: 'optional',
      encryptionAtRest: 'none',
      credentialSource: 'environment_or_source',
      retentionDays: 0,
      deletionMode: 'unscoped_delete',
      backupMode: 'unencrypted',
      restoreTesting: 'never',
      recoveryPointObjectiveHours: 0,
      auditMode: 'full_payload_logs',
      conformanceVerified: false
    })

    expect(result).toEqual({
      status: 'rejected',
      reasons: [
        'non_production_adapter',
        'durability_not_guaranteed',
        'atomicity_not_database_enforced',
        'scope_isolation_not_database_enforced',
        'transport_security_not_required',
        'encryption_at_rest_not_declared',
        'credential_source_not_approved',
        'retention_policy_invalid',
        'deletion_policy_not_revision_bound',
        'backup_policy_not_approved',
        'restore_testing_not_declared',
        'recovery_objective_invalid',
        'audit_policy_not_privacy_safe',
        'conformance_not_verified'
      ]
    })
  })

  it('rejects malformed numeric policy values without coercion', () => {
    for (const retentionDays of [
      1.5,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1
    ]) {
      const result = validateCoordinatorRepairStateProductionContract({
        ...validContract(),
        retentionDays
      })
      expect(result).toEqual({
        status: 'rejected',
        reasons: ['retention_policy_invalid']
      })
    }

    for (const recoveryPointObjectiveHours of [0.5, 169, Number.NaN]) {
      const result = validateCoordinatorRepairStateProductionContract({
        ...validContract(),
        recoveryPointObjectiveHours
      })
      expect(result).toEqual({
        status: 'rejected',
        reasons: ['recovery_objective_invalid']
      })
    }
  })

  it('rejects missing, additional, inherited, accessor, array, and class-instance fields', () => {
    const missing = validContract() as unknown as Record<string, unknown>
    delete missing.auditMode

    const inherited = Object.create(validContract()) as Record<string, unknown>
    Object.assign(inherited, validContract())
    delete inherited.auditMode

    const accessor = validContract() as unknown as Record<string, unknown>
    Object.defineProperty(accessor, 'auditMode', {
      enumerable: true,
      get() {
        throw new Error('must not execute getters')
      }
    })

    class ContractHolder {
      version = 1
    }

    for (const value of [
      missing,
      { ...validContract(), unexpected: true },
      inherited,
      accessor,
      [],
      new ContractHolder()
    ]) {
      expect(validateCoordinatorRepairStateProductionContract(value)).toEqual({
        status: 'rejected',
        reasons: ['invalid_contract_shape']
      })
    }
  })

  it('rejects hidden non-enumerable and symbol-keyed properties', () => {
    const nonEnumerable = validContract() as unknown as Record<string, unknown>
    Object.defineProperty(nonEnumerable, 'credential', {
      configurable: true,
      enumerable: false,
      value: 'must-not-be-accepted'
    })

    const symbolKeyed = validContract() as unknown as Record<PropertyKey, unknown>
    symbolKeyed[Symbol('credential')] = 'must-not-be-accepted'

    for (const value of [nonEnumerable, symbolKeyed]) {
      expect(validateCoordinatorRepairStateProductionContract(value)).toEqual({
        status: 'rejected',
        reasons: ['invalid_contract_shape']
      })
    }
  })

  it('fails closed for hostile proxies without leaking thrown details', () => {
    const hostile = new Proxy(validContract(), {
      getPrototypeOf() {
        throw new Error('secret backend details')
      }
    })

    expect(validateCoordinatorRepairStateProductionContract(hostile)).toEqual({
      status: 'rejected',
      reasons: ['invalid_contract_shape']
    })
  })

  it('does not retain caller references or expose submitted values in rejection reasons', () => {
    const input = validContract()
    const approved = validateCoordinatorRepairStateProductionContract(input)
    expect(approved.status).toBe('approved')
    if (approved.status !== 'approved') throw new Error('expected approved contract')

    input.retentionDays = 999
    expect(approved.contract.retentionDays).toBe(30)

    const rejected = validateCoordinatorRepairStateProductionContract({
      ...validContract(),
      credentialSource: 'embedded-secret-value'
    })
    expect(rejected).toEqual({
      status: 'rejected',
      reasons: ['credential_source_not_approved']
    })
    expect(JSON.stringify(rejected)).not.toContain('embedded-secret-value')
  })
})
