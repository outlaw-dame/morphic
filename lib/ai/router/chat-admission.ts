import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'

import { admitResearchRoute, type RouterAdmissionResult } from './router-admission'

import type { ResearchMode } from '@/lib/ai/schemas'
import type { SearchMode } from '@/lib/types/search'

const MAX_CHAT_QUERY_LENGTH = 16_000
const PROCESS_SCOPE_KEY = randomBytes(32)

const MessagePartSchema = z
  .object({
    type: z.string().optional(),
    text: z.string().optional()
  })
  .passthrough()

const ChatMessageSchema = z
  .object({
    role: z.string().optional(),
    content: z.string().optional(),
    parts: z.array(MessagePartSchema).optional()
  })
  .passthrough()

export class ChatAdmissionInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChatAdmissionInputError'
  }
}

function boundedQuery(value: string): string {
  const query = value.trim()
  if (!query) throw new ChatAdmissionInputError('A user query is required.')
  if (query.length > MAX_CHAT_QUERY_LENGTH) {
    throw new ChatAdmissionInputError('The user query is too long.')
  }
  return query
}

function textFromMessage(input: unknown): string | null {
  const parsed = ChatMessageSchema.safeParse(input)
  if (!parsed.success) return null

  if (typeof parsed.data.content === 'string' && parsed.data.content.trim()) {
    return parsed.data.content
  }

  const text = parsed.data.parts
    ?.filter(part => part.type === undefined || part.type === 'text')
    .map(part => part.text?.trim() ?? '')
    .filter(Boolean)
    .join('\n')

  return text || null
}

export function extractAdmissionQuery(input: Readonly<{
  trigger?: unknown
  message?: unknown
  messages?: unknown
}>): string {
  if (input.trigger === 'submit-message') {
    const submitted = textFromMessage(input.message)
    if (submitted) return boundedQuery(submitted)
    if (typeof input.message === 'string') return boundedQuery(input.message)
  }

  if (Array.isArray(input.messages)) {
    for (let index = input.messages.length - 1; index >= 0; index -= 1) {
      const parsed = ChatMessageSchema.safeParse(input.messages[index])
      if (!parsed.success || parsed.data.role !== 'user') continue
      const query = textFromMessage(parsed.data)
      if (query) return boundedQuery(query)
    }
  }

  const fallback = textFromMessage(input.message)
  if (fallback) return boundedQuery(fallback)
  if (typeof input.message === 'string') return boundedQuery(input.message)

  throw new ChatAdmissionInputError('A user query is required.')
}

function requestedResearchMode(searchMode: SearchMode): ResearchMode {
  return searchMode === 'adaptive' ? 'adaptive' : 'quick'
}

export function executionSearchMode(mode: ResearchMode): SearchMode {
  return mode === 'quick' ? 'quick' : 'adaptive'
}

function scopeBindingKey(): Buffer {
  const configured =
    process.env.AI_SCOPE_BINDING_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET

  return configured ? createHash('sha256').update(configured).digest() : PROCESS_SCOPE_KEY
}

function ownerScopeId(userId: string | null): string {
  if (!userId) return `guest_${randomUUID()}`

  const digest = createHmac('sha256', scopeBindingKey())
    .update(userId)
    .digest('hex')
  return `user_${digest}`
}

export async function admitChatRequest(options: Readonly<{
  query: string
  requestedSearchMode: SearchMode
  userId: string | null
  signal?: AbortSignal
}>): Promise<RouterAdmissionResult> {
  return admitResearchRoute({
    input: {
      query: boundedQuery(options.query),
      requestedMode: requestedResearchMode(options.requestedSearchMode)
    },
    ownerScopeId: ownerScopeId(options.userId),
    executionId: `execution_${randomUUID()}`,
    invocationId: `router_${randomUUID()}`,
    signal: options.signal
  })
}
