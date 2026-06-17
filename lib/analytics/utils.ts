import type { UIMessage } from 'ai'

/**
 * Calculate the conversation turn number (1-indexed) for the message being sent.
 *
 * Counts distinct user messages by id. `currentMessageId` is included so the
 * result is stable whether or not the history, which may be cached, already
 * contains the message being sent.
 *
 * @param messages - Array of UI messages from the conversation
 * @param currentMessageId - Id of the current message being submitted, if any
 * @returns Turn number (1-indexed)
 */
export function calculateConversationTurn(
  messages: UIMessage[],
  currentMessageId?: string
): number {
  const userIds = new Set(
    messages.filter(msg => msg.role === 'user').map(msg => msg.id)
  )

  if (currentMessageId) {
    userIds.add(currentMessageId)
  }

  return Math.max(1, userIds.size)
}
