import type { z } from 'zod'

const MAX_CONTRACT_DEPTH = 16
const MAX_CONTRACT_NODES = 10_000

export class InvalidArchitectureContractError extends Error {
  constructor() {
    super('Invalid AI architecture contract.')
    this.name = 'InvalidArchitectureContractError'
  }
}

type ExtractionState = {
  nodes: number
  seen: WeakSet<object>
}

function fail(): never {
  throw new InvalidArchitectureContractError()
}

function extractPlainValue(
  value: unknown,
  depth: number,
  state: ExtractionState
): unknown {
  state.nodes += 1
  if (state.nodes > MAX_CONTRACT_NODES || depth > MAX_CONTRACT_DEPTH) fail()

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail()
    return value
  }

  if (typeof value !== 'object') fail()
  if (state.seen.has(value)) fail()
  state.seen.add(value)

  try {
    if (Array.isArray(value)) {
      const ownKeys = Reflect.ownKeys(value)
      if (
        ownKeys.some(
          key =>
            typeof key !== 'string' ||
            (key !== 'length' && !/^(0|[1-9]\d*)$/.test(key))
        )
      ) {
        fail()
      }

      const output: unknown[] = []
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
        if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) {
          fail()
        }
        output.push(extractPlainValue(descriptor.value, depth + 1, state))
      }
      return output
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) fail()

    const output = Object.create(null) as Record<string, unknown>
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') fail()
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) {
        fail()
      }
      output[key] = extractPlainValue(descriptor.value, depth + 1, state)
    }
    return output
  } catch (error) {
    if (error instanceof InvalidArchitectureContractError) throw error
    fail()
  } finally {
    state.seen.delete(value)
  }
}

export function parseArchitectureContract<T>(
  schema: z.ZodType<T>,
  input: unknown
): T {
  try {
    const plainInput = extractPlainValue(input, 0, {
      nodes: 0,
      seen: new WeakSet<object>()
    })
    return schema.parse(plainInput)
  } catch {
    throw new InvalidArchitectureContractError()
  }
}
