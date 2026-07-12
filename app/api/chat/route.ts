import { revalidateTag } from 'next/cache'
import { cookies } from 'next/headers'

import { loadChat } from '@/lib/actions/chat'
import {
  parsePersonalizationCookie,
  PERSONALIZATION_COOKIE_NAME
} from '@/lib/agents/personalization'
import {
  assertLegacyResearchStreamAllowed,
  decideGovernedStreamRollout
} from '@/lib/ai/rollout/governed-stream-rollout'
import {
  admitChatRequest,
  ChatAdmissionInputError,
  executionSearchMode,
  extractAdmissionQuery
} from '@/lib/ai/router/chat-admission'
import { createRouteExecutionContext } from '@/lib/ai/router/execution-context'
import { calculateConversationTurn, trackChatEvent } from '@/lib/analytics'
import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { checkAndEnforceAdaptiveLimit } from '@/lib/rate-limit/adaptive-limit'
import { checkAndEnforceOverallChatLimit } from '@/lib/rate-limit/chat-limits'
import {
  checkAndEnforceGuestLimit,
  isGuestChatEnabled
} from '@/lib/rate-limit/guest-limit'
import {
  ADAPTIVE_MODE_AUTH_REQUIRED_MESSAGE,
  isAdaptiveModeAuthBlocked
} from '@/lib/search-mode-availability'
import { createChatStreamResponse } from '@/lib/streaming/create-chat-stream-response'
import { createEphemeralChatStreamResponse } from '@/lib/streaming/create-ephemeral-chat-stream-response'
import { SearchMode } from '@/lib/types/search'
import { selectModel } from '@/lib/utils/model-selection'
import { perfLog, perfTime } from '@/lib/utils/perf-logging'
import { resetAllCounters } from '@/lib/utils/perf-tracking'
import { isProviderEnabled } from '@/lib/utils/registry'

export const maxDuration = 300

export async function POST(req: Request) {
  const startTime = performance.now()
  const abortSignal = req.signal

  if (process.env.ENABLE_PERF_LOGGING === 'true') {
    resetAllCounters()
  }

  try {
    const body = await req.json()
    const { message, messages, chatId, trigger, messageId, isNewChat } = body

    perfLog(
      `API Route - Start: chatId=${chatId}, trigger=${trigger}, isNewChat=${isNewChat}`
    )

    if (trigger === 'regenerate-message') {
      if (!messageId) {
        return new Response('messageId is required for regeneration', {
          status: 400,
          statusText: 'Bad Request'
        })
      }
    } else if (trigger === 'submit-message') {
      if (!message) {
        return new Response('message is required for submission', {
          status: 400,
          statusText: 'Bad Request'
        })
      }
    }

    const referer = req.headers.get('referer')
    const isSharePage = referer?.includes('/share/')

    const authStart = performance.now()
    const userId = await getCurrentUserId()
    perfTime('Auth completed', authStart)

    if (isSharePage) {
      return new Response('Chat API is not available on share pages', {
        status: 403,
        statusText: 'Forbidden'
      })
    }

    const isGuest = !userId
    if (isGuest && !isGuestChatEnabled()) {
      return new Response('Authentication required', {
        status: 401,
        statusText: 'Unauthorized'
      })
    }

    if (isGuest) {
      const forwardedFor = req.headers.get('x-forwarded-for') || ''
      const ip =
        forwardedFor.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        null
      const guestLimitResponse = await checkAndEnforceGuestLimit(ip)
      if (guestLimitResponse) return guestLimitResponse
    }

    const cookieStore = await cookies()
    const personalization = parsePersonalizationCookie(
      cookieStore.get(PERSONALIZATION_COOKIE_NAME)?.value
    )

    const searchModeCookie = cookieStore.get('searchMode')?.value
    const requestedSearchMode: SearchMode =
      searchModeCookie && ['quick', 'adaptive'].includes(searchModeCookie)
        ? (searchModeCookie as SearchMode)
        : 'quick'

    let admissionQuery: string
    try {
      admissionQuery = extractAdmissionQuery({ trigger, message, messages })
    } catch (error) {
      if (error instanceof ChatAdmissionInputError) {
        return new Response(error.message, {
          status: 400,
          statusText: 'Bad Request'
        })
      }
      throw error
    }

    const admissionStart = performance.now()
    const admission = await admitChatRequest({
      query: admissionQuery,
      requestedSearchMode,
      userId: userId ?? null,
      signal: abortSignal
    })
    const routeContext = createRouteExecutionContext({
      routePlan: admission.routePlan,
      routeDigest: admission.routeDigest
    })
    const searchMode = executionSearchMode(routeContext.routePlan.mode)
    perfTime('Router admission completed', admissionStart)
    perfLog(
      `Router admission: mode=${routeContext.routePlan.mode}, executionMode=${searchMode}, risk=${routeContext.routePlan.riskLevel}, digest=${routeContext.routeDigest.slice(0, 12)}`
    )

    let rolloutDecision
    try {
      rolloutDecision = decideGovernedStreamRollout({
        cohortKey: userId
          ? `authenticated:${userId}`
          : `guest:${chatId || routeContext.routeDigest}`,
        routeDigest: routeContext.routeDigest
      })
      assertLegacyResearchStreamAllowed(rolloutDecision)
    } catch (error) {
      console.error('Governed stream rollout rejected request:', error)
      return new Response(
        'Governed research streaming is temporarily unavailable',
        {
          status: 503,
          statusText: 'Service Unavailable'
        }
      )
    }

    perfLog(
      `Governed stream rollout: mode=${rolloutDecision.mode}, selected=${rolloutDecision.selected}, percentage=${rolloutDecision.percentage}, cohort=${rolloutDecision.cohortId}`
    )

    if (
      isAdaptiveModeAuthBlocked({
        mode: searchMode,
        isGuest,
        isCloudDeployment: process.env.MORPHIC_CLOUD_DEPLOYMENT === 'true'
      })
    ) {
      return new Response(
        JSON.stringify({
          error: ADAPTIVE_MODE_AUTH_REQUIRED_MESSAGE,
          mode: 'adaptive',
          authRequired: true
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const selectedModel = await selectModel({ searchMode, cookieStore })

    if (!selectedModel) {
      return new Response('No enabled model is available', {
        status: 503,
        statusText: 'Service Unavailable'
      })
    }

    if (!isProviderEnabled(selectedModel.providerId, cookieStore)) {
      return new Response(
        `Selected provider is not enabled ${selectedModel.providerId}`,
        {
          status: 404,
          statusText: 'Not Found'
        }
      )
    }

    if (!isGuest) {
      const overallLimitResponse = await checkAndEnforceOverallChatLimit(userId)
      if (overallLimitResponse) return overallLimitResponse

      if (searchMode === 'adaptive') {
        const adaptiveLimitResponse = await checkAndEnforceAdaptiveLimit(userId)
        if (adaptiveLimitResponse) return adaptiveLimitResponse
      }
    }

    const streamStart = performance.now()
    perfLog(
      `createChatStreamResponse - Start: model=${selectedModel.providerId}:${selectedModel.id}, searchMode=${searchMode}`
    )

    const response = isGuest
      ? await createEphemeralChatStreamResponse({
          messages: Array.isArray(messages) ? messages : [],
          model: selectedModel,
          abortSignal,
          searchMode,
          chatId,
          personalization,
          routeContext,
          rolloutDecision
        })
      : await createChatStreamResponse({
          message,
          model: selectedModel,
          chatId,
          userId,
          trigger,
          messageId,
          abortSignal,
          isNewChat,
          searchMode,
          personalization,
          routeContext,
          rolloutDecision
        })

    perfTime('createChatStreamResponse resolved', streamStart)
    ;(async () => {
      try {
        let conversationTurn = 1

        if (!isNewChat && !isGuest) {
          const chat = await loadChat(chatId, userId)
          if (chat?.messages) {
            conversationTurn = calculateConversationTurn(chat.messages) + 1
          }
        }

        if (!isGuest && userId) {
          await trackChatEvent({
            searchMode,
            conversationTurn,
            isNewChat: isNewChat ?? false,
            trigger:
              (trigger as 'submit-message' | 'regenerate-message') ??
              'submit-message',
            chatId,
            userId,
            providerId: selectedModel.providerId,
            modelId: selectedModel.id
          })
        }
      } catch (error) {
        console.error('Analytics tracking failed:', error)
      }
    })()

    if (chatId && !isGuest) {
      revalidateTag(`chat-${chatId}`, 'max')
    }

    const totalTime = performance.now() - startTime
    perfLog(`Total API route time: ${totalTime.toFixed(2)}ms`)
    perfLog(`=== Summary ===`)
    perfLog(`Chat Type: ${isNewChat ? 'NEW' : 'EXISTING'}`)
    perfLog(`Total Time: ${totalTime.toFixed(2)}ms`)

    return response
  } catch (error) {
    console.error('Chat API error:', error)
    return new Response('Internal Server Error', {
      status: 500,
      statusText: 'Internal Server Error'
    })
  }
}
