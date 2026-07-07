export type CoordinatorPolicySeverity = 'info' | 'warn' | 'block'

export type CoordinatorPolicyDetail = {
  type: string
  id?: string
  severity?: CoordinatorPolicySeverity
  evidenceIds?: string[]
  claimIds?: string[]
  reason?: string
}

export type CoordinatorPolicyResult = {
  id: string
  passed: boolean
  severity: CoordinatorPolicySeverity
  reason: string
  repairActions: string[]
  details: CoordinatorPolicyDetail[]
}

export function passPolicy(id: string, reason: string): CoordinatorPolicyResult {
  return {
    id,
    passed: true,
    severity: 'info',
    reason,
    repairActions: [],
    details: []
  }
}

export function failPolicy(input: {
  id: string
  severity: CoordinatorPolicySeverity
  reason: string
  repairActions: string[]
  details?: CoordinatorPolicyDetail[]
}): CoordinatorPolicyResult {
  return {
    id: input.id,
    passed: false,
    severity: input.severity,
    reason: input.reason,
    repairActions: input.repairActions,
    details: input.details ?? []
  }
}
