import { describe, expect, it } from 'vitest'

import { ModelRoleSchema } from '@/lib/ai/schemas'

import { getRolePrompt, listRolePrompts } from './role-prompts'

describe('AI role prompt registry', () => {
  it('defines one prompt for every model role', () => {
    const roles = ModelRoleSchema.options
    const prompts = listRolePrompts()

    expect(prompts.map(prompt => prompt.role).sort()).toEqual([...roles].sort())
  })

  it('returns versioned prompt metadata for individual roles', () => {
    const routerPrompt = getRolePrompt('router')

    expect(routerPrompt.role).toBe('router')
    expect(routerPrompt.version).toMatch(/^\d{4}-\d{2}-\d{2}\.v\d+$/)
    expect(routerPrompt.systemPrompt).toContain('Route')
    expect(routerPrompt.outputContract).toBe('RoutePlan')
  })

  it('keeps internal role prompts separate from user-facing answers', () => {
    for (const prompt of listRolePrompts()) {
      expect(prompt.systemPrompt).not.toContain('chain-of-thought')
      expect(prompt.systemPrompt.length).toBeGreaterThan(50)
      expect(prompt.outputContract.length).toBeGreaterThan(0)
    }
  })
})
