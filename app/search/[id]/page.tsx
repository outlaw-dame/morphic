import { notFound, redirect } from 'next/navigation'

import { UIMessage } from 'ai'

import { loadChat } from '@/lib/actions/chat'
import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { getModelSelectorData } from '@/lib/model-selector/get-model-selector-data'

import { Chat } from '@/components/chat'

export const maxDuration = 60
const SEARCH_PAGE_DATA_TIMEOUT_MS = 8_000

function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = SEARCH_PAGE_DATA_TIMEOUT_MS
): Promise<T | null> {
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      console.warn(`[SearchPage] ${label} timed out after ${timeoutMs}ms`)
      resolve(null)
    }, timeoutMs)

    promise.then(
      value => {
        clearTimeout(timeout)
        resolve(value)
      },
      error => {
        clearTimeout(timeout)
        console.error(`[SearchPage] ${label} failed`, error)
        resolve(null)
      }
    )
  })
}

async function safeGetCurrentUserId() {
  return withTimeout(getCurrentUserId(), 'getCurrentUserId')
}

async function safeLoadChat(id: string, userId?: string | null) {
  return withTimeout(loadChat(id, userId ?? undefined), 'loadChat')
}

export async function generateMetadata(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const userId = await safeGetCurrentUserId()

  const chat = await safeLoadChat(id, userId)

  if (!chat) {
    return { title: 'Search' }
  }

  return {
    title: chat.title.toString().slice(0, 50) || 'Search'
  }
}

export default async function SearchPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const userId = await safeGetCurrentUserId()

  const chat = await safeLoadChat(id, userId)

  if (!chat) {
    notFound()
  }

  if (chat.visibility === 'private' && !userId) {
    redirect('/auth/login')
  }

  const messages: UIMessage[] = chat.messages
  const isCloudDeployment = process.env.MORPHIC_CLOUD_DEPLOYMENT === 'true'
  const modelSelectorData = await getModelSelectorData()

  return (
    <Chat
      id={id}
      savedMessages={messages}
      isGuest={!userId}
      isCloudDeployment={isCloudDeployment}
      modelSelectorData={modelSelectorData}
      presentation="results"
    />
  )
}
