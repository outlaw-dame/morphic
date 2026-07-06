export type CoordinatorPolicySeverity = 'info' | 'warn' | 'block'

export type CoordinatorPolicyResult = {
  id: string
  passed: boolean
  severity: CoordinatorPolicySeverity
  reason: string
  repairActions: string[]
}

export function passPolicy(id: string, reason: string): CoordinatorPolicyResult {
  return {
    id,
    passed: true,
    severity: 'info',
    reason,
    repairActions: []
  }
}

export function failPolicy(input: {
  id: string
  severity: CoordinatorPolicySeverity
  reason: string
  repairActions: string[]
}): CoordinatorPolicyResult {
  return {
    id: input.id,
    passed: false,
    severity: input.severity,
    reason: input.reason,
    repairActions: input.repairActions
  }
}
