import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage
} from 'ai'

import type { RouteExecutionContext } from '@/lib/ai/router/execution-context'

import type { ProductionGovernedChainInput } from '../agents/coordinator/production-governed-chain'
import { runProductionGovernedChain } from '../agents/coordinator/production-governed-chain'

const TEXT_PART_ID = 'governed-release-text'
const MAX_RELEASED_DRAFT_LENGTH = 200_000

export type GovernedProductionStreamInput = Readonly<{
  chain: ProductionGovernedChainInput
  routeContext: RouteExecutionContext
  originalMessages?: readonly UIMessage[]
  onFinish?: (
    input: Readonly<{
      responseMessage: UIMessage
      isAborted: boolean
    }>
  ) => Promise<void> | void
}>

function validateReleasedDraft(
  released: Awaited<ReturnType<typeof runProductionGovernedChain>>,
  routeContext: RouteExecutionContext
): string {
  if (
    !released ||
    typeof released !== 'object' ||
    released.status !== 'released' ||
    released.routeDigest !== routeContext.routeDigest ||
    typeof released.executionId !== 'string' ||
    released.executionId.length === 0 ||
    typeof released.draft !== 'string' ||
    released.draft.length === 0 ||
    released.draft.length > MAX_RELEASED_DRAFT_LENGTH
  ) {
    throw new Error('Invalid governed production release result.')
  }

  return released.draft
}

export function createGovernedProductionStreamResponse(
  input: GovernedProductionStreamInput
): Response {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid governed production stream input.')
  }
  if (input.chain.routeContext !== input.routeContext) {
    throw new Error('Governed production stream route context mismatch.')
  }

  const stream = createUIMessageStream({
    ...(input.originalMessages
      ? { originalMessages: [...input.originalMessages] }
      : {}),
    async execute({ writer }) {
      const released = await runProductionGovernedChain(input.chain)
      const draft = validateReleasedDraft(released, input.routeContext)

      writer.write({ type: 'text-start', id: TEXT_PART_ID })
      writer.write({ type: 'text-delta', id: TEXT_PART_ID, delta: draft })
      writer.write({ type: 'text-end', id: TEXT_PART_ID })
    },
    onError() {
      return 'The governed response could not be released.'
    },
    ...(input.onFinish
      ? {
          async onFinish({ responseMessage, isAborted }) {
            await input.onFinish?.({ responseMessage, isAborted })
          }
        }
      : {})
  })

  return createUIMessageStreamResponse({ stream })
}
