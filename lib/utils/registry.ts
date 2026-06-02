import { anthropic } from '@ai-sdk/anthropic'
import { createGateway } from '@ai-sdk/gateway'
import { google } from '@ai-sdk/google'
import { mistral } from '@ai-sdk/mistral'
import { openai } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createProviderRegistry, LanguageModel } from 'ai'
import { createOllama } from 'ai-sdk-ollama'

// Strip a trailing /v1 from the configured base URL, then re-append it,
// so both shapes work for OpenAI-compatible hosts:
//   OPENAI_COMPATIBLE_API_BASE_URL=https://api.deepseek.com
//   OPENAI_COMPATIBLE_API_BASE_URL=https://api.deepseek.com/v1
function normalizeOpenAICompatibleBaseURL(raw: string): string {
  return raw.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1'
}

function stringifyMessageContent(content: unknown): unknown {
  if (!Array.isArray(content)) {
    return content
  }

  return content
    .map(part => {
      if (typeof part === 'string') {
        return part
      }

      if (
        part &&
        typeof part === 'object' &&
        'type' in part &&
        part.type === 'text' &&
        'text' in part
      ) {
        return String(part.text ?? '')
      }

      return JSON.stringify(part)
    })
    .filter(Boolean)
    .join('\n')
}

function normalizeCloudflareRequestBody(args: Record<string, any>) {
  const messages = Array.isArray(args.messages)
    ? args.messages.map(message => {
        const normalized = {
          ...message,
          content: stringifyMessageContent(message.content)
        }

        if (
          normalized.role === 'assistant' &&
          Array.isArray(normalized.tool_calls) &&
          normalized.tool_calls.length > 0 &&
          normalized.content === ''
        ) {
          normalized.content = null
        }

        return normalized
      })
    : args.messages

  return {
    ...args,
    messages
  }
}

function stringifyCloudflareDeltaContent(content: unknown): string | undefined {
  if (content == null) {
    return content as undefined
  }

  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map(part => (typeof part === 'string' ? part : JSON.stringify(part)))
      .join('')
  }

  return String(content)
}

function normalizeCloudflareSseLine(line: string): string {
  if (!line.startsWith('data: ')) {
    return line
  }

  const payload = line.slice('data: '.length)
  if (payload === '[DONE]') {
    return line
  }

  try {
    const json = JSON.parse(payload)
    if (Array.isArray(json?.choices)) {
      json.choices = json.choices.map((choice: Record<string, any>) => {
        if (
          choice?.delta &&
          'content' in choice.delta &&
          choice.delta.content != null &&
          typeof choice.delta.content !== 'string'
        ) {
          return {
            ...choice,
            delta: {
              ...choice.delta,
              content: stringifyCloudflareDeltaContent(choice.delta.content)
            }
          }
        }

        return choice
      })
    }

    return `data: ${JSON.stringify(json)}`
  } catch {
    return line
  }
}

async function fetchCloudflare(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init)
  const url = String(input)
  const contentType = response.headers.get('content-type') || ''

  if (
    !response.body ||
    !url.includes('/chat/completions') ||
    !contentType.includes('text/event-stream')
  ) {
    return response
  }

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''

  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          controller.enqueue(
            encoder.encode(`${normalizeCloudflareSseLine(line)}\n`)
          )
        }
      },
      flush(controller) {
        buffer += decoder.decode()
        if (buffer) {
          controller.enqueue(encoder.encode(normalizeCloudflareSseLine(buffer)))
        }
      }
    })
  )

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  })
}

// Build providers object conditionally
const providers: Record<string, any> = {
  openai,
  anthropic,
  google,
  mistral,
  'openai-compatible': createOpenAICompatible({
    // Keep the SDK provider key stable. OPENAI_COMPATIBLE_PROVIDER_NAME is
    // only a UI label used by the model selector.
    name: 'openai-compatible',
    apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
    baseURL: normalizeOpenAICompatibleBaseURL(
      process.env.OPENAI_COMPATIBLE_API_BASE_URL || ''
    )
  }),
  nvidia: createOpenAICompatible({
    name: 'nvidia',
    apiKey: process.env.NVIDIA_API_KEY,
    baseURL: normalizeOpenAICompatibleBaseURL(
      process.env.NVIDIA_API_BASE_URL || 'https://integrate.api.nvidia.com'
    )
  }),
  gateway: createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY
  }),
  cloudflare: createOpenAICompatible({
    name: 'cloudflare',
    apiKey: process.env.CLOUDFLARE_API_TOKEN,
    baseURL: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
    headers: {
      'cf-aig-gateway-id': process.env.CLOUDFLARE_AI_GATEWAY_ID || 'default'
    },
    fetch: fetchCloudflare,
    transformRequestBody: normalizeCloudflareRequestBody
  })
}

// Only add Ollama if OLLAMA_BASE_URL is configured
const ollamaProvider = process.env.OLLAMA_BASE_URL
  ? createOllama({ baseURL: process.env.OLLAMA_BASE_URL })
  : null

if (ollamaProvider) {
  providers.ollama = ollamaProvider
}

export const registry = createProviderRegistry(providers)

export function getModel(model: string): LanguageModel {
  // For Ollama models, bypass the registry to pass model-level settings
  // that ai-sdk-ollama requires (think, supportedUrls override).
  if (model.startsWith('ollama:') && ollamaProvider) {
    const modelId = model.slice('ollama:'.length)
    const lm = ollamaProvider(modelId, { think: true })

    // Ollama's Chat API only accepts base64 in the images field, not URLs.
    // Override supportedUrls to force AI SDK to download images and convert
    // them to base64 before sending to the model.
    Object.defineProperty(lm, 'supportedUrls', {
      value: {},
      configurable: true
    })

    return lm
  }

  return registry.languageModel(
    model as Parameters<typeof registry.languageModel>[0]
  )
}

export function isProviderEnabled(providerId: string): boolean {
  switch (providerId) {
    case 'openai':
      return !!process.env.OPENAI_API_KEY
    case 'anthropic':
      return !!process.env.ANTHROPIC_API_KEY
    case 'google':
      return !!process.env.GOOGLE_GENERATIVE_AI_API_KEY
    case 'openai-compatible':
      return (
        !!process.env.OPENAI_COMPATIBLE_API_KEY &&
        !!process.env.OPENAI_COMPATIBLE_API_BASE_URL
      )
    case 'gateway':
      return !!process.env.AI_GATEWAY_API_KEY
    case 'ollama':
      return !!process.env.OLLAMA_BASE_URL
    case 'cloudflare':
      return (
        !!process.env.CLOUDFLARE_API_TOKEN &&
        !!process.env.CLOUDFLARE_ACCOUNT_ID
      )
    case 'nvidia':
      return !!process.env.NVIDIA_API_KEY
    case 'mistral':
      return !!process.env.MISTRAL_API_KEY
    default:
      return false
  }
}
