import {
  consumeStream,
  convertToModelMessages,
  pruneMessages,
  smoothStream
} from 'ai'
import { randomUUID } from 'crypto'
import { Langfuse } from 'langfuse'

import { researcher } from '@/lib/agents/researcher'
import {
  createPublicErrorResponse,
  serializePublicError
} from '@/lib/errors/public-error'
import { isTracingEnabled } from '@/lib/utils/telemetry'

import { loadChat } from '../actions/chat'
import { generateChatTitle } from '../agents/title-generator'
import {
  getMaxAllowedTokens,
  shouldTruncateMessages,
  truncateMessages
} from '../utils/context-window'
import { getTextFromParts } from '../utils/message-utils'
import { perfLog, perfTime } from '../utils/perf-logging'

import { persistStreamResults } from './helpers/persist-stream-results'
import { prepareMessages } from './helpers/prepare-messages'
import { stripReasoningParts } from './helpers/strip-reasoning-parts'
import { stripSpecFromMessages } from './helpers/strip-spec-from-messages'
import type { StreamContext } from './helpers/types'
import { BaseStreamConfig } from './types'

const DEFAULT_CHAT_TITLE = 'Untitled'

export async function createChatStreamResponse(
  config: BaseStreamConfig
): Promise<Response> {
  const {
    message,
    model,
    chatId,
    userId,
    trigger,
    messageId,
    abortSignal,
    isNewChat,
    searchMode,
    personalization,
    routeContext
  } = config

  if (!chatId) {
    return new Response('Chat ID is required', {
      status: 400,
      statusText: 'Bad Request'
    })
  }

  let initialChat = null
  if (!isNewChat) {
    const loadChatStart = performance.now()
    initialChat = await loadChat(chatId, userId)
    perfTime('loadChat completed', loadChatStart)

    if (initialChat && initialChat.userId !== userId) {
      return new Response('You are not allowed to access this chat', {
        status: 403,
        statusText: 'Forbidden'
      })
    }
  } else {
    perfLog('loadChat skipped for new chat')
  }

  let parentTraceId: string | undefined
  let langfuse: Langfuse | undefined

  if (isTracingEnabled()) {
    parentTraceId = randomUUID()
    langfuse = new Langfuse()

    langfuse.trace({
      id: parentTraceId,
      name: 'research',
      metadata: {
        chatId,
        userId,
        modelId: `${model.providerId}:${model.id}`,
        trigger,
        routeDigest: routeContext.routeDigest,
        routeMode: routeContext.routePlan.mode,
        routeRisk: routeContext.routePlan.riskLevel
      }
    })
  }

  const context: StreamContext = {
    chatId,
    userId,
    modelId: `${model.providerId}:${model.id}`,
    messageId,
    trigger,
    initialChat,
    abortSignal,
    parentTraceId,
    isNewChat
  }

  let titlePromise: Promise<string> | undefined

  try {
    const prepareStart = performance.now()
    perfLog(
      `prepareMessages - Invoked: trigger=${trigger}, isNewChat=${isNewChat}`
    )
    const messagesToModel = await prepareMessages(context, message)
    perfTime('prepareMessages completed (stream)', prepareStart)

    const researchAgent = researcher({
      model: context.modelId,
      modelConfig: model,
      parentTraceId,
      searchMode,
      personalization,
      routeContext
    })

    const isOpenAI = context.modelId.startsWith('openai:')
    const messagesWithoutSpec = stripSpecFromMessages(messagesToModel)
    const messagesToConvert = isOpenAI
      ? stripReasoningParts(messagesWithoutSpec)
      : messagesWithoutSpec

    let modelMessages = await convertToModelMessages(messagesToConvert)

    modelMessages = pruneMessages({
      messages: modelMessages,
      reasoning: 'before-last-message',
      toolCalls: 'before-last-2-messages',
      emptyMessages: 'remove'
    })

    if (shouldTruncateMessages(modelMessages, model)) {
      const maxTokens = getMaxAllowedTokens(model)
      const originalCount = modelMessages.length
      modelMessages = truncateMessages(modelMessages, maxTokens, model.id)

      if (process.env.NODE_ENV === 'development') {
        console.log(
          `Context window limit reached. Truncating from ${originalCount} to ${modelMessages.length} messages`
        )
      }
    }

    if (!initialChat && message) {
      const userContent = getTextFromParts(message.parts)
      titlePromise = generateChatTitle({
        userMessageContent: userContent,
        modelId: context.modelId,
        abortSignal,
        parentTraceId
      }).catch(error => {
        console.error('Error generating title:', error)
        return DEFAULT_CHAT_TITLE
      })
    }

    const llmStart = performance.now()
    perfLog(
      `researchAgent.stream - Start: model=${context.modelId}, searchMode=${searchMode}`
    )
    const result = await researchAgent.stream({
      messages: modelMessages,
      abortSignal,
      experimental_transform: smoothStream({ chunking: 'word' })
    })
    result.consumeStream()

    return result.toUIMessageStreamResponse({
      messageMetadata: ({ part }) => {
        if (part.type === 'start') {
          return {
            traceId: parentTraceId,
            searchMode,
            modelId: context.modelId,
            routeDigest: routeContext.routeDigest,
            routeMode: routeContext.routePlan.mode
          }
        }
      },
      onFinish: async ({ responseMessage, isAborted }) => {
        try {
          perfTime('researchAgent.stream completed', llmStart)
          if (isAborted || !responseMessage) return

          await persistStreamResults(
            responseMessage,
            chatId,
            userId,
            titlePromise,
            parentTraceId,
            searchMode,
            context.modelId,
            context.pendingInitialSave,
            context.pendingInitialUserMessage
          )
        } finally {
          if (langfuse) {
            await langfuse.flushAsync()
          }
        }
      },
      onError: (error: unknown) => {
        console.error('Stream response error:', error)
        return serializePublicError(error)
      },
      consumeSseStream: consumeStream
    })
  } catch (error) {
    if (langfuse) {
      await langfuse.flushAsync()
    }
    console.error('Stream execution error:', error)
    return createPublicErrorResponse(error, {
      status: 500,
      statusText: 'Internal Server Error'
    })
  }
}
