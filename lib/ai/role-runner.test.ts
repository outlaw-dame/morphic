import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  createTrustedRoleExecutionScope,
  InvalidTrustedRoleExecutionScopeError,
  type RoleProviderAdapter,
  type RoleRunnerLimits,
  runRole,
  TransientRoleProviderError,
  type TrustedRoleExecutionScope
} from './role-runner'

const InputSchema = z
  .object({
    query: z.string().min(1).max(256)
  })
  .strict()

const OutputSchema = z
  .object({
    answer: z.string().min(1).max(1024)
  })
  .strict()

const prompt = {
  version: 'advisor-v1',
  instruction: 'Return only the validated advisor response.',
  inputSchemaVersion: 1,
  outputSchemaVersion: 1
} as const

const limits: RoleRunnerLimits = {
  maxInputBytes: 4096,
  maxOutputBytes: 4096,
  maxOutputTokens: 512
}

function scope(
  permissions: TrustedRoleExecutionScope['allowedPermissionClasses'] = ['none'],
  deadlineAt = new Date(Date.now() + 60_000).toISOString()
): TrustedRoleExecutionScope {
  return createTrustedRoleExecutionScope({
    ownerScopeId: 'owner_scope_00000001',
    executionId: 'execution_00000001',
    invocationId: 'invocation_0000001',
    deadlineAt,
    allowedPermissionClasses: permissions
  })
}

function candidate(
  role: 'advisor' | 'retriever' = 'advisor'
): Record<string, unknown> {
  return {
    providerId: 'provider-a',
    modelId: `${role}-model`,
    family: `${role}-family`,
    availability: 'available',
    locality: 'remote',
    reliability: 'strong',
    maxContextTokens: 64_000,
    estimatedLatencyMs: 100,
    estimatedCostPerMillionTokensUsd: 1,
    capabilities:
      role === 'retriever'
        ? [
            {
              capability: 'tool_calling',
              provenance: 'deployment_configured'
            },
            {
              capability: 'reasoning',
              provenance: 'model_card_declared'
            }
          ]
        : [
            {
              capability: 'structured_output',
              provenance: 'deployment_configured'
            },
            {
              capability: 'reasoning',
              provenance: 'model_card_declared'
            }
          ],
    roleQuality: [
      {
        role,
        score: 0.99,
        fixtureVersion: `${role}-fixture-v1`,
        verifiedAt: new Date().toISOString()
      }
    ],
    cooldownUntil: null
  }
}

function successfulAdapter(): RoleProviderAdapter<{ query: string }> {
  return {
    invoke: vi.fn(async () => ({
      output: { answer: 'validated' },
      outputTokens: 4
    }))
  }
}

describe('common hardened role runner', () => {
  it('binds trusted owner and execution scope into a validated invocation record', async () => {
    const adapter = successfulAdapter()
    const trustedScope = scope()

    const outcome = await runRole({
      scope: trustedScope,
      role: 'advisor',
      candidates: [candidate()],
      prompt,
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      input: { query: 'ground this answer' },
      adapter,
      limits
    })

    expect(outcome.result.status).toBe('succeeded')
    expect(outcome.result.failureClass).toBeNull()
    expect(outcome.result.outputDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(outcome.request.selectedModelId).toBe('provider-a/advisor-model')
    expect(outcome.output).toEqual({ answer: 'validated' })
    expect(adapter.invoke).toHaveBeenCalledTimes(1)
    expect(vi.mocked(adapter.invoke).mock.calls[0]?.[0]).toMatchObject({
      ownerScopeId: trustedScope.ownerScopeId,
      executionId: trustedScope.executionId,
      invocationId: trustedScope.invocationId,
      permissionClass: 'none',
      attempt: 1
    })
  })

  it('rejects forged or copied scope objects before provider access', async () => {
    const adapter = successfulAdapter()
    const forged = {
      ownerScopeId: 'owner_scope_00000001',
      executionId: 'execution_00000001',
      invocationId: 'invocation_0000001',
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      allowedPermissionClasses: ['none'] as const
    }

    await expect(
      runRole({
        scope: forged,
        role: 'advisor',
        candidates: [candidate()],
        prompt,
        inputSchema: InputSchema,
        outputSchema: OutputSchema,
        input: { query: 'forged' },
        adapter,
        limits
      })
    ).rejects.toBeInstanceOf(InvalidTrustedRoleExecutionScopeError)
    expect(adapter.invoke).not.toHaveBeenCalled()
  })

  it('rejects malformed candidate collections and adapters as configuration errors', async () => {
    const adapterGetter = vi.fn(() => successfulAdapter().invoke)
    const hostileAdapter = Object.defineProperty({}, 'invoke', {
      enumerable: true,
      get: adapterGetter
    })

    await expect(
      runRole({
        scope: scope(),
        role: 'advisor',
        candidates: null as never,
        prompt,
        inputSchema: InputSchema,
        outputSchema: OutputSchema,
        input: { query: 'invalid candidates' },
        adapter: successfulAdapter(),
        limits
      })
    ).rejects.toThrow('Invalid role runner configuration.')

    await expect(
      runRole({
        scope: scope(),
        role: 'advisor',
        candidates: [candidate()],
        prompt,
        inputSchema: InputSchema,
        outputSchema: OutputSchema,
        input: { query: 'invalid adapter' },
        adapter: hostileAdapter as never,
        limits
      })
    ).rejects.toThrow('Invalid role runner configuration.')
    expect(adapterGetter).not.toHaveBeenCalled()
  })

  it('does not execute hostile input or candidate accessors', async () => {
    const adapter = successfulAdapter()
    const inputGetter = vi.fn(() => 'stolen')
    const candidateGetter = vi.fn(() => 'provider-a')
    const hostileInput = Object.defineProperty({}, 'query', {
      enumerable: true,
      get: inputGetter
    })
    const hostileCandidate = Object.defineProperty({}, 'providerId', {
      enumerable: true,
      get: candidateGetter
    })

    const invalidInput = await runRole({
      scope: scope(),
      role: 'advisor',
      candidates: [candidate()],
      prompt,
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      input: hostileInput,
      adapter,
      limits
    })
    const invalidCandidate = await runRole({
      scope: scope(),
      role: 'advisor',
      candidates: [hostileCandidate],
      prompt,
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      input: { query: 'safe' },
      adapter,
      limits
    })

    expect(inputGetter).not.toHaveBeenCalled()
    expect(candidateGetter).not.toHaveBeenCalled()
    expect(invalidInput.result.failureClass).toBe('invalid_input')
    expect(invalidCandidate.result.failureClass).toBe('no_eligible_model')
    expect(adapter.invoke).not.toHaveBeenCalled()
  })

  it('enforces canonical tool permission grants outside model control', async () => {
    const adapter = successfulAdapter()

    const denied = await runRole({
      scope: scope(['none']),
      role: 'retriever',
      candidates: [candidate('retriever')],
      prompt: { ...prompt, version: 'retriever-v1' },
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      input: { query: 'retrieve' },
      adapter,
      limits
    })

    expect(denied.result.failureClass).toBe('policy_violation')
    expect(denied.result.reasonCodes).toContain('tool_permission_not_granted')
    expect(adapter.invoke).not.toHaveBeenCalled()
  })

  it('rejects malformed, accessor-backed, oversized, and over-token outputs', async () => {
    const getter = vi.fn(() => ({ answer: 'unsafe' }))
    const cases: Array<RoleProviderAdapter<{ query: string }>> = [
      {
        invoke: async () => ({ output: { wrong: true }, outputTokens: 1 })
      },
      {
        invoke: async () =>
          Object.defineProperty({ outputTokens: 1 }, 'output', {
            enumerable: true,
            get: getter
          }) as never
      },
      {
        invoke: async () => ({
          output: { answer: 'x'.repeat(200) },
          outputTokens: 1
        })
      },
      {
        invoke: async () => ({
          output: { answer: 'valid' },
          outputTokens: 513
        })
      }
    ]

    for (const adapter of cases) {
      const outcome = await runRole({
        scope: scope(),
        role: 'advisor',
        candidates: [candidate()],
        prompt,
        inputSchema: InputSchema,
        outputSchema: OutputSchema,
        input: { query: 'validate output' },
        adapter,
        limits: { ...limits, maxOutputBytes: 64 }
      })
      expect(outcome.result.failureClass).toBe('malformed_output')
      expect(outcome.output).toBeNull()
    }
    expect(getter).not.toHaveBeenCalled()
  })

  it('uses bounded exponential retry only for tool-free idempotent calls', async () => {
    let attempts = 0
    const adapter: RoleProviderAdapter<{ query: string }> = {
      invoke: vi.fn(async invocation => {
        attempts += 1
        if (attempts === 1) throw new TransientRoleProviderError()
        return {
          output: { answer: `attempt-${invocation.attempt}` },
          outputTokens: 4
        }
      })
    }

    const outcome = await runRole({
      scope: scope(),
      role: 'advisor',
      candidates: [candidate()],
      prompt,
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      input: { query: 'retry safely' },
      adapter,
      limits,
      retryPolicy: {
        maxAttempts: 3,
        initialDelayMs: 10,
        maximumDelayMs: 20,
        idempotent: true
      }
    })

    expect(outcome.result.status).toBe('succeeded')
    expect(outcome.output).toEqual({ answer: 'attempt-2' })
    expect(adapter.invoke).toHaveBeenCalledTimes(2)
  })

  it('never retries a tool-bearing role even when marked idempotent', async () => {
    const adapter: RoleProviderAdapter<{ query: string }> = {
      invoke: vi.fn(async () => {
        throw new TransientRoleProviderError()
      })
    }

    const outcome = await runRole({
      scope: scope(['bounded_retrieval']),
      role: 'retriever',
      candidates: [candidate('retriever')],
      prompt: { ...prompt, version: 'retriever-v1' },
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      input: { query: 'do not duplicate tools' },
      adapter,
      limits,
      retryPolicy: {
        maxAttempts: 3,
        initialDelayMs: 10,
        maximumDelayMs: 20,
        idempotent: true
      }
    })

    expect(outcome.result.failureClass).toBe('transient_provider_failure')
    expect(adapter.invoke).toHaveBeenCalledTimes(1)
  })

  it('races cancellation and deadlines against an uncooperative provider', async () => {
    const never: RoleProviderAdapter<{ query: string }> = {
      invoke: vi.fn(
        () =>
          new Promise<Readonly<{ output: unknown; outputTokens: number }>>(
            () => undefined
          )
      )
    }
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 10)

    const cancelled = await runRole({
      scope: scope(),
      role: 'advisor',
      candidates: [candidate()],
      prompt,
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      input: { query: 'cancel' },
      adapter: never,
      limits,
      signal: controller.signal
    })
    const timedOut = await runRole({
      scope: scope(['none'], new Date(Date.now() + 15).toISOString()),
      role: 'advisor',
      candidates: [candidate()],
      prompt,
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      input: { query: 'timeout' },
      adapter: never,
      limits
    })

    expect(cancelled.result.status).toBe('cancelled')
    expect(cancelled.result.failureClass).toBe('cancelled')
    expect(timedOut.result.status).toBe('failed')
    expect(timedOut.result.failureClass).toBe('timeout')
  })

  it('validates deterministic fallback output without invoking a provider', async () => {
    const adapter = successfulAdapter()

    const outcome = await runRole({
      scope: scope(),
      role: 'advisor',
      candidates: [],
      prompt,
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      input: { query: 'fallback' },
      adapter,
      limits,
      deterministicFallback: input => ({ answer: `safe:${input.query}` })
    })

    expect(outcome.result.status).toBe('succeeded')
    expect(outcome.request.selectedModelId).toBeNull()
    expect(outcome.result.reasonCodes).toContain(
      'deterministic_fallback_completed'
    )
    expect(outcome.output).toEqual({ answer: 'safe:fallback' })
    expect(adapter.invoke).not.toHaveBeenCalled()
  })

  it('accepts a schema-valid null input without confusing it with parse failure', async () => {
    const NullInputSchema = z.null()
    const adapter: RoleProviderAdapter<null> = {
      invoke: vi.fn(async invocation => ({
        output: { answer: invocation.input === null ? 'null-ok' : 'wrong' },
        outputTokens: 2
      }))
    }

    const outcome = await runRole({
      scope: scope(),
      role: 'advisor',
      candidates: [candidate()],
      prompt,
      inputSchema: NullInputSchema,
      outputSchema: OutputSchema,
      input: null,
      adapter,
      limits
    })

    expect(outcome.result.status).toBe('succeeded')
    expect(outcome.output).toEqual({ answer: 'null-ok' })
  })

  it('fails before invocation when total prompt and input bytes exceed budget', async () => {
    const adapter = successfulAdapter()

    const outcome = await runRole({
      scope: scope(),
      role: 'advisor',
      candidates: [candidate()],
      prompt: { ...prompt, instruction: 'x'.repeat(100) },
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      input: { query: 'budget' },
      adapter,
      limits: { ...limits, maxInputBytes: 32 }
    })

    expect(outcome.result.failureClass).toBe('invalid_input')
    expect(outcome.result.reasonCodes).toContain('role_input_limit_exceeded')
    expect(adapter.invoke).not.toHaveBeenCalled()
  })
})
