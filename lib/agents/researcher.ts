import { stepCountIs, tool, ToolLoopAgent } from 'ai'

import {
  buildRouteExecutionGuidance,
  type RouteExecutionContext
} from '@/lib/ai/router/execution-context'
import type { ResearcherTools } from '@/lib/types/agent'
import { type Model } from '@/lib/types/models'

import { createFactCheckTool } from '../tools/factcheck'
import { createFeedTool } from '../tools/feed'
import { fetchTool } from '../tools/fetch'
import { createMapTool } from '../tools/map'
import { createQuestionTool } from '../tools/question'
import { createSearchTool } from '../tools/search'
import { createSourcePreferencesTool } from '../tools/source-preferences'
import { createResearchSubtaskTool } from '../tools/subtask-agent'
import { createTodoTools } from '../tools/todo'
import { SearchMode } from '../types/search'
import { getModel } from '../utils/registry'
import { isTracingEnabled } from '../utils/telemetry'

import {
  getAdaptiveModePrompt,
  QUICK_MODE_PROMPT
} from './prompts/search-mode-prompts'
import {
  buildMistralServerToolHeaders,
  hasMistralNativeWebSearchEnabled,
  MISTRAL_SOURCE_FIRST_NATIVE_SEARCH_GUIDANCE
} from './mistral-server-tools'
import { buildOpenRouterServerToolHeaders } from './openrouter-server-tools'
import {
  buildPersonalizationPrompt,
  type PersonalizationSettings
} from './personalization'
import { applyPromptOverrideSync } from './prompt-overrides'

function wrapSearchToolForQuickMode<
  T extends ReturnType<typeof createSearchTool>
>(originalTool: T): T {
  return tool({
    description: originalTool.description,
    inputSchema: originalTool.inputSchema,
    async *execute(params, context) {
      const executeFunc = originalTool.execute
      if (!executeFunc) {
        throw new Error('Search tool execute function is not defined')
      }

      const modifiedParams = {
        ...params,
        type: 'optimized' as const
      }

      const result = executeFunc(modifiedParams, context)

      if (
        result &&
        typeof result === 'object' &&
        Symbol.asyncIterator in result
      ) {
        for await (const chunk of result) {
          yield chunk
        }
      } else {
        const finalResult = await result
        yield finalResult || {
          state: 'complete' as const,
          results: [],
          images: [],
          query: params.query,
          number_of_results: 0
        }
      }
    }
  }) as T
}

export function createResearcher({
  model,
  modelConfig,
  parentTraceId,
  searchMode = 'adaptive',
  personalization,
  routeContext
}: {
  model: string
  modelConfig?: Model
  parentTraceId?: string
  searchMode?: SearchMode
  personalization?: PersonalizationSettings
  routeContext?: RouteExecutionContext
}) {
  try {
    const currentDate = new Date().toLocaleString()

    const originalSearchTool = createSearchTool(model)
    const askQuestionTool = createQuestionTool(model)
    const todoTools = createTodoTools()
    const researchSubtaskTool = createResearchSubtaskTool(model)
    const feedSearchTool = createFeedTool()
    const mapSearchTool = createMapTool()
    const factCheckTool = createFactCheckTool()
    const sourcePreferencesTool = createSourcePreferencesTool()

    let systemPrompt: string
    let activeToolsList: (keyof ResearcherTools)[] = []
    let maxSteps: number
    let searchTool = originalSearchTool

    switch (searchMode) {
      case 'quick':
        console.log(
          '[Researcher] Quick mode: maxSteps=20, tools=[search, fetch, googleFactCheck, sourcePreferences]'
        )
        systemPrompt = applyPromptOverrideSync(QUICK_MODE_PROMPT, 'quick')
        activeToolsList = [
          'search',
          'fetch',
          'googleFactCheck',
          'sourcePreferences'
        ]
        maxSteps = 20
        searchTool = wrapSearchToolForQuickMode(originalSearchTool)
        break
      case 'adaptive':
      default:
        systemPrompt = applyPromptOverrideSync(
          getAdaptiveModePrompt(),
          'adaptive'
        )
        activeToolsList = [
          'search',
          'feedSearch',
          'fetch',
          'todoWrite',
          'researchSubtask',
          'mapSearch',
          'googleFactCheck',
          'sourcePreferences'
        ]
        console.log(
          `[Researcher] Adaptive mode: maxSteps=50, tools=[${activeToolsList.join(', ')}]`
        )
        maxSteps = 50
        searchTool = originalSearchTool
        break
    }

    const personalizationPrompt = buildPersonalizationPrompt(personalization)
    const providerId = modelConfig?.providerId ?? model.split(':')[0]
    const hasMistralNativeSearch = hasMistralNativeWebSearchEnabled(
      providerId,
      modelConfig?.providerOptions
    )
    const routerPrompt = applyPromptOverrideSync(
      'Router model guidance: act as the orchestrator for the answer. For simple questions, search directly and answer with citations. For high-cost, adversarial, multi-domain, or ambiguous questions, use a Fusion-style pattern: gather independent evidence paths with search, feedSearch, fact-checking, and researchSubtask, then synthesize consensus, contradictions, blind spots, and source quality. Before finalizing complex answers, use an Advisor-style self-review: check whether a stronger or more specialized subtask/review pass is warranted, verify citations, and state uncertainty honestly. Do not use extra agents when the task is simple enough for direct search.',
      'router'
    )
    const routeGuidance = routeContext
      ? buildRouteExecutionGuidance(routeContext)
      : ''

    const tools: ResearcherTools = {
      search: searchTool,
      feedSearch: feedSearchTool,
      mapSearch: mapSearchTool,
      fetch: fetchTool,
      askQuestion: askQuestionTool,
      researchSubtask: researchSubtaskTool,
      googleFactCheck: factCheckTool,
      sourcePreferences: sourcePreferencesTool,
      ...todoTools
    } as ResearcherTools

    const agent = new ToolLoopAgent({
      model: getModel(model),
      instructions: [
        systemPrompt,
        `Current date and time: ${currentDate}`,
        routeGuidance,
        routerPrompt,
        hasMistralNativeSearch
          ? MISTRAL_SOURCE_FIRST_NATIVE_SEARCH_GUIDANCE
          : '',
        personalizationPrompt,
        'Source preference memory: when the user explicitly says to rely on, prefer, avoid, mute, block, or never use a source/domain/URL, call sourcePreferences to save it before continuing. If the user explicitly scopes that instruction to a topic, subject, or use case, save it with a source preference profile name and profile terms so it only affects matching future searches. Use sourcePreferences list when the user asks what source preferences are remembered. Do not infer durable preferences from one-off citations or casual mentions.'
      ]
        .filter(Boolean)
        .join('\n\n'),
      tools,
      activeTools: activeToolsList,
      stopWhen: stepCountIs(maxSteps),
      ...(modelConfig?.providerOptions && {
        providerOptions: modelConfig.providerOptions
      }),
      prepareCall: options => {
        const headers = new Headers()
        for (const [key, value] of Object.entries(options.headers ?? {})) {
          if (value !== undefined) {
            headers.set(key, value)
          }
        }
        const openRouterHeaders = buildOpenRouterServerToolHeaders(
          providerId,
          options.providerOptions ?? modelConfig?.providerOptions
        )
        const mistralHeaders = buildMistralServerToolHeaders(
          providerId,
          options.providerOptions ?? modelConfig?.providerOptions
        )

        for (const [key, value] of Object.entries({
          ...openRouterHeaders,
          ...mistralHeaders
        })) {
          headers.set(key, value)
        }

        return {
          ...options,
          headers: Object.fromEntries(headers.entries())
        }
      },
      experimental_telemetry: {
        isEnabled: isTracingEnabled(),
        functionId: 'research-agent',
        metadata: {
          modelId: model,
          agentType: 'researcher',
          searchMode,
          ...(routeContext && {
            routeDigest: routeContext.routeDigest,
            routeMode: routeContext.routePlan.mode,
            routeRisk: routeContext.routePlan.riskLevel
          }),
          ...(parentTraceId && {
            langfuseTraceId: parentTraceId,
            langfuseUpdateParent: false
          })
        }
      }
    })

    return agent
  } catch (error) {
    console.error('Error in createResearcher:', error)
    throw error
  }
}

export function getResearcherTools(
  agent: ToolLoopAgent<never, ResearcherTools, never>
): ResearcherTools {
  return agent.tools
}

export const researcher = createResearcher
