import { tool, UIToolInvocation } from 'ai'

import {
  wolframAlphaSchema,
  type WolframAlphaSchema
} from '@/lib/schema/wolfram'
import type {
  WolframAlphaResult,
  WolframPod,
  WolframSource
} from '@/lib/types/wolfram'

const DEFAULT_FULL_RESULTS_ENDPOINT =
  'https://api.wolframalpha.com/v2/query'
const DEFAULT_SHORT_ANSWERS_ENDPOINT =
  'https://api.wolframalpha.com/v1/result'

function getWolframAppId(): string {
  const appId =
    process.env.WOLFRAM_ALPHA_APP_ID ||
    process.env.WOLFRAMALPHA_APP_ID ||
    process.env.WOLFRAM_APP_ID

  if (!appId?.trim()) {
    throw new Error(
      'Wolfram|Alpha is not configured. Set WOLFRAM_ALPHA_APP_ID.'
    )
  }

  return appId.trim()
}

function getUnitParam(units: WolframAlphaSchema['units'], mode: 'short' | 'full') {
  if (!units) return undefined
  if (mode === 'short') return units === 'metric' ? 'metric' : 'imperial'
  return units === 'metric' ? 'metric' : 'nonmetric'
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function compact(values: unknown[]): string[] {
  return values.map(textValue).filter(Boolean)
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (Array.isArray(value)) return value
  return value == null ? [] : [value]
}

function buildWolframInputUrl(query: string) {
  const url = new URL('https://www.wolframalpha.com/input')
  url.searchParams.set('i', query)
  return url.toString()
}

function extractPods(queryresult: any): WolframPod[] {
  return asArray(queryresult?.pods)
    .map((pod: any): WolframPod | null => {
      const plaintext = compact(
        asArray(pod?.subpods).flatMap((subpod: any) => [
          subpod?.plaintext,
          subpod?.moutput
        ])
      )

      if (!plaintext.length) return null

      return {
        id: textValue(pod?.id) || textValue(pod?.title) || 'pod',
        title: textValue(pod?.title) || 'Result',
        primary: pod?.primary === true,
        plaintext
      }
    })
    .filter((pod): pod is WolframPod => pod !== null)
}

function extractSources(queryresult: any): WolframSource[] {
  return asArray(queryresult?.sources?.source)
    .map((source: any): WolframSource | null => {
      const text = textValue(source?.text)
      const url = textValue(source?.url)
      if (!text || !url) return null
      return { text, url }
    })
    .filter((source): source is WolframSource => source !== null)
}

function extractAssumptions(queryresult: any): string[] {
  return compact(
    asArray(queryresult?.assumptions?.assumption).flatMap((assumption: any) =>
      asArray(assumption?.values?.value).map((value: any) => value?.desc)
    )
  )
}

function extractDidYouMeans(queryresult: any): string[] {
  return compact(
    asArray(queryresult?.didyoumeans?.didyoumean).map((item: any) =>
      typeof item === 'string' ? item : item?.val || item?.['#text']
    )
  )
}

function extractWarnings(queryresult: any): string[] {
  const warnings = queryresult?.warnings
  if (!warnings || typeof warnings !== 'object') return []

  return Object.values(warnings)
    .flatMap(value => asArray(value as any))
    .flatMap((value: any) => [
      value?.text,
      value?.msg,
      value?.word,
      typeof value === 'string' ? value : ''
    ])
    .map(textValue)
    .filter(Boolean)
}

function pickPrimaryAnswer(pods: WolframPod[]) {
  const primary = pods.find(pod => pod.primary)
  if (primary?.plaintext[0]) return primary.plaintext[0]

  const result = pods.find(pod => pod.id === 'Result' || pod.title === 'Result')
  if (result?.plaintext[0]) return result.plaintext[0]

  return pods[0]?.plaintext[0]
}

async function fetchWithTimeout(url: URL, timeoutMs = 10_000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json,text/plain;q=0.9',
        'User-Agent': 'Morphic/1.0 (WolframAlpha integration)'
      }
    })
  } finally {
    clearTimeout(timeout)
  }
}

export async function queryWolframAlpha({
  query,
  mode = 'full',
  units,
  location
}: WolframAlphaSchema): Promise<WolframAlphaResult> {
  const appId = getWolframAppId()

  if (mode === 'short') {
    const endpoint = new URL(
      process.env.WOLFRAM_ALPHA_SHORT_ANSWERS_URL ||
        DEFAULT_SHORT_ANSWERS_ENDPOINT
    )
    endpoint.searchParams.set('appid', appId)
    endpoint.searchParams.set('i', query)
    endpoint.searchParams.set('timeout', '6')

    const unitParam = getUnitParam(units, 'short')
    if (unitParam) endpoint.searchParams.set('units', unitParam)

    const response = await fetchWithTimeout(endpoint)
    const answer = (await response.text()).trim()

    if (!response.ok) {
      throw new Error(
        answer || `Wolfram|Alpha short answer failed: HTTP ${response.status}`
      )
    }

    return {
      state: 'complete',
      query,
      mode,
      answer,
      pods: answer
        ? [{ id: 'ShortAnswer', title: 'Short answer', primary: true, plaintext: [answer] }]
        : [],
      sources: [],
      assumptions: [],
      didYouMeans: [],
      warnings: [],
      url: buildWolframInputUrl(query)
    }
  }

  const endpoint = new URL(
    process.env.WOLFRAM_ALPHA_FULL_RESULTS_URL || DEFAULT_FULL_RESULTS_ENDPOINT
  )
  endpoint.searchParams.set('appid', appId)
  endpoint.searchParams.set('input', query)
  endpoint.searchParams.set('output', 'json')
  endpoint.searchParams.set('format', 'plaintext')
  endpoint.searchParams.set('timeout', '6')

  const unitParam = getUnitParam(units, 'full')
  if (unitParam) endpoint.searchParams.set('units', unitParam)
  if (location?.trim()) endpoint.searchParams.set('location', location.trim())

  const response = await fetchWithTimeout(endpoint)
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(`Wolfram|Alpha full results failed: HTTP ${response.status}`)
  }

  const queryresult = payload?.queryresult
  if (!queryresult || queryresult.error === true) {
    throw new Error('Wolfram|Alpha returned an error for this query.')
  }

  const pods = extractPods(queryresult)
  const didYouMeans = extractDidYouMeans(queryresult)

  if (queryresult.success === false && !pods.length) {
    const suggestions = didYouMeans.length
      ? ` Did you mean: ${didYouMeans.join(', ')}?`
      : ''
    throw new Error(`Wolfram|Alpha did not understand the query.${suggestions}`)
  }

  return {
    state: 'complete',
    query,
    mode,
    answer: pickPrimaryAnswer(pods),
    pods,
    sources: extractSources(queryresult),
    assumptions: extractAssumptions(queryresult),
    didYouMeans,
    warnings: extractWarnings(queryresult),
    url: buildWolframInputUrl(query)
  }
}

export const wolframAlphaTool = tool({
  description:
    'Use Wolfram|Alpha for computational knowledge: math, symbolic algebra, unit conversions, chemistry/physics facts, dates, geography facts, and other computed answers. Prefer mode="full" for richer structured pods; use mode="short" for a concise one-line result.',
  inputSchema: wolframAlphaSchema,
  async *execute(input, context) {
    yield {
      state: 'computing' as const,
      query: input.query,
      mode: input.mode || 'full'
    }

    const result = await queryWolframAlpha(input)

    yield {
      ...result,
      toolCallId: context?.toolCallId
    }
  }
})

export type WolframAlphaUIToolInvocation = UIToolInvocation<
  typeof wolframAlphaTool
>
