import { describe, expect, it } from 'vitest'

import { ModelRoleSchema } from '@/lib/ai/schemas'

import {
  getRoleSelectionProfileV2,
  ROLE_SELECTION_PROFILES_V2
} from './role-profiles-v2'

describe('canonical role selection profiles v2', () => {
  it('defines exactly one profile for every canonical model role', () => {
    expect(Object.keys(ROLE_SELECTION_PROFILES_V2).sort()).toEqual(
      [...ModelRoleSchema.options].sort()
    )

    for (const role of ModelRoleSchema.options) {
      const profile = getRoleSelectionProfileV2(role)
      expect(profile.role).toBe(role)
      expect(profile.hardCapabilities.length).toBeGreaterThan(0)
      expect(profile.minimumRoleQualityScore).toBeGreaterThanOrEqual(0.8)
      expect(profile.maximumQualityAgeDays).toBeGreaterThan(0)
      expect(profile.requiredToolPermissionClass.length).toBeGreaterThan(0)
    }
  })

  it('keeps Router and Coordinator tool permissions non-executing', () => {
    expect(
      getRoleSelectionProfileV2('router').requiredToolPermissionClass
    ).toBe('none')
    expect(
      getRoleSelectionProfileV2('coordinator').requiredToolPermissionClass
    ).toBe('none')
  })

  it('requires explicit bounded permission classes for tool-adjacent roles', () => {
    expect(
      getRoleSelectionProfileV2('retriever').requiredToolPermissionClass
    ).toBe('bounded_retrieval')
    expect(
      getRoleSelectionProfileV2('entity_grounding').requiredToolPermissionClass
    ).toBe('entity_resolution_only')
    expect(
      getRoleSelectionProfileV2('citation_verifier').requiredToolPermissionClass
    ).toBe('evidence_read_only')
  })
})
