import type { CoordinatorLifecycleState } from './contracts'

export const TERMINAL_COORDINATOR_STATES = Object.freeze([
  'released',
  'refused_or_caveated',
  'cancelled',
  'failed'
] as const satisfies readonly CoordinatorLifecycleState[])

const LEGAL_TRANSITIONS: Readonly<
  Record<CoordinatorLifecycleState, readonly CoordinatorLifecycleState[]>
> = Object.freeze({
  created: ['routed', 'cancelled', 'failed'],
  routed: ['planning', 'cancelled', 'failed'],
  planning: ['retrieving', 'normalizing_evidence', 'cancelled', 'failed'],
  retrieving: [
    'normalizing_evidence',
    'awaiting_repairs',
    'cancelled',
    'failed'
  ],
  normalizing_evidence: [
    'grounding_entities',
    'evaluating_evidence',
    'awaiting_repairs',
    'cancelled',
    'failed'
  ],
  grounding_entities: [
    'evaluating_evidence',
    'awaiting_repairs',
    'refused_or_caveated',
    'cancelled',
    'failed'
  ],
  evaluating_evidence: [
    'awaiting_repairs',
    'composing',
    'refused_or_caveated',
    'cancelled',
    'failed'
  ],
  awaiting_repairs: [
    'retrieving',
    'grounding_entities',
    'evaluating_evidence',
    'repairing',
    'refused_or_caveated',
    'cancelled',
    'failed'
  ],
  composing: [
    'advising',
    'verifying',
    'awaiting_repairs',
    'cancelled',
    'failed'
  ],
  advising: [
    'verifying',
    'awaiting_repairs',
    'refused_or_caveated',
    'cancelled',
    'failed'
  ],
  verifying: [
    'repairing',
    'ready_for_release',
    'refused_or_caveated',
    'cancelled',
    'failed'
  ],
  repairing: [
    'retrieving',
    'grounding_entities',
    'evaluating_evidence',
    'composing',
    'verifying',
    'refused_or_caveated',
    'cancelled',
    'failed'
  ],
  ready_for_release: ['released', 'refused_or_caveated', 'cancelled', 'failed'],
  released: [],
  refused_or_caveated: [],
  cancelled: [],
  failed: []
})

export function isTerminalCoordinatorState(
  state: CoordinatorLifecycleState
): boolean {
  return (TERMINAL_COORDINATOR_STATES as readonly string[]).includes(state)
}

export function isLegalCoordinatorTransition(
  from: CoordinatorLifecycleState,
  to: CoordinatorLifecycleState
): boolean {
  return LEGAL_TRANSITIONS[from].includes(to)
}

export function getLegalCoordinatorTransitions(
  from: CoordinatorLifecycleState
): readonly CoordinatorLifecycleState[] {
  return LEGAL_TRANSITIONS[from]
}
