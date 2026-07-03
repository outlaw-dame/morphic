import { NextRequest, NextResponse } from 'next/server'

import { getChatsPage } from '@/lib/actions/chat'
import { Chat as DBChat } from '@/lib/db/schema'

interface ChatPageResponse {
  chats: DBChat[]
  nextOffset: number | null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const requestedOffset = parseInt(searchParams.get('offset') || '0', 10)
  const requestedLimit = parseInt(searchParams.get('limit') || '20', 10)
  const offset =
    Number.isFinite(requestedOffset) && requestedOffset > 0
      ? requestedOffset
      : 0
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 50)
      : 20

  try {
    const result = await getChatsPage(limit, offset)
    return NextResponse.json<ChatPageResponse>(result)
  } catch (error) {
    console.warn('API route degraded fetching chats:', error)
    return NextResponse.json<ChatPageResponse>(
      { chats: [], nextOffset: null },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'X-Gist-Degraded': 'chat-history'
        }
      }
    )
  }
}
