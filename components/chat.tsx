'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { toast } from 'sonner'

import { ChatProvider } from '@/lib/contexts/chat-context'
import { generateId } from '@/lib/db/schema'
import {
  getPublicRateLimitDetails,
  toPublicErrorPayload
} from '@/lib/errors/public-error'
import { SHORTCUT_EVENTS } from '@/lib/keyboard-shortcuts'
import { stripSpecBlocks } from '@/lib/render/strip-spec-blocks'
import {
  ADAPTIVE_MODE_AUTH_REQUIRED_MESSAGE,
  isAdaptiveModeAuthBlocked
} from '@/lib/search-mode-availability'
import { UploadedFile } from '@/lib/types'
import type { UIMessage } from '@/lib/types/ai'
import {
  isDynamicToolPart,
  isToolCallPart,
  isToolTypePart
} from '@/lib/types/dynamic-tools'
import type { ModelSelectorData } from '@/lib/types/model-selector'
import { cn } from '@/lib/utils'
import { getCookie } from '@/lib/utils/cookies'

import { useFileDropzone } from '@/hooks/use-file-dropzone'

import { NativeIcon } from './native/native-icon'
import { ChatMessages } from './chat-messages'
import { ChatPanel } from './chat-panel'
import { DragOverlay } from './drag-overlay'
import { ErrorModal } from './error-modal'

// Define section structure
interface ChatSection {
  id: string // User message ID
  userMessage: UIMessage
  assistantMessages: UIMessage[]
}

const homeWeather = {
  city: 'San Francisco',
  temp: 64,
  condition: 'Partly Cloudy',
  hi: 71,
  lo: 56,
  hourly: [
    { time: 'Now', temp: 64, icon: 'cloud' },
    { time: '8AM', temp: 66, icon: 'cloud' },
    { time: '9AM', temp: 68, icon: 'sun' },
    { time: '10AM', temp: 70, icon: 'sun' },
    { time: '11AM', temp: 71, icon: 'sun' },
    { time: '12PM', temp: 71, icon: 'cloud' }
  ]
}

const homeBriefingItems = [
  {
    id: 'pwa-hooks',
    kind: 'article',
    kicker: 'TECH',
    title: 'Apple opens deeper PWA hooks to home-screen apps',
    source: 'The Verge',
    readTime: '4 min read',
    sourceType: 'RSS',
    thumb: 'linear-gradient(135deg,#3b3a54 0%,#74749b 100%)',
    initials: 'V'
  },
  {
    id: 'hard-fork-pwa',
    kind: 'podcast',
    kicker: 'HARD FORK',
    title: 'The web that installs itself — PWAs grow up',
    source: 'S3 E42',
    date: 'Jun 3',
    duration: '52 min',
    chapters: 5,
    thumb: 'linear-gradient(135deg,#6d5cff 0%,#4822a8 65%,#251442 100%)',
    initials: 'HF'
  },
  {
    id: 'serif-headline',
    kind: 'article',
    kicker: 'DESIGN',
    title: 'The quiet return of the serif headline',
    source: "It's Nice That",
    readTime: '6 min read',
    sourceType: 'JSON Feed',
    thumb: 'linear-gradient(135deg,#c9b89d 0%,#8b7459 100%)',
    initials: 'IN'
  },
  {
    id: 'carbon-cycle',
    kind: 'article',
    kicker: 'SCIENCE',
    title: 'A new map of the deep-ocean carbon cycle',
    source: 'Quanta',
    readTime: '8 min read',
    sourceType: 'Feed',
    thumb: 'linear-gradient(135deg,#173d57 0%,#2bbfa0 100%)',
    initials: 'Q'
  }
] as const

function WeatherIcon({
  type,
  className
}: {
  type: string
  className?: string
}) {
  if (type === 'sun') {
    return <NativeIcon name="themeLight" className={className} />
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      className={cn('shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6.7 18h10.6a3.7 3.7 0 0 0 .5-7.37 6.1 6.1 0 0 0-11.75-1.6A4.52 4.52 0 0 0 6.7 18Z" />
    </svg>
  )
}

function WeatherCard() {
  return (
    <section
      aria-label="Weather"
      className="rounded-[22px] border border-white/10 bg-zinc-900/80 px-8 py-6 text-white shadow-[0_22px_70px_rgba(0,0,0,0.34)] backdrop-blur-2xl md:px-9"
    >
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-[1.38rem] leading-none text-white/56">
            {homeWeather.city}
          </p>
          <div className="mt-3 flex items-start">
            <span className="text-[4.8rem] font-light leading-[0.86] tracking-normal text-white md:text-[5.25rem]">
              {homeWeather.temp}
            </span>
            <span className="mt-1 text-[2.2rem] font-light leading-none text-white">
              °
            </span>
          </div>
        </div>
        <div className="pt-2 text-right">
          <WeatherIcon type="cloud" className="ml-auto size-10 text-white" />
          <p className="mt-4 text-[1.25rem] leading-tight text-white/60">
            {homeWeather.condition}
          </p>
          <p className="text-[1.13rem] leading-tight text-white/58">
            H:{homeWeather.hi}° L:{homeWeather.lo}°
          </p>
        </div>
      </div>
      <div className="mt-7 grid grid-cols-6 border-t border-white/10 pt-5">
        {homeWeather.hourly.map(hour => (
          <div
            key={hour.time}
            className="flex min-w-0 flex-col items-center gap-2 text-center"
          >
            <span className="text-[0.95rem] leading-none text-white/56">
              {hour.time}
            </span>
            <WeatherIcon
              type={hour.icon}
              className="size-[18px] text-white/88"
            />
            <span className="text-[1.25rem] leading-none text-white">
              {hour.temp}°
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function SourceBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.055] px-2 py-1 align-middle font-mono text-[0.72rem] font-medium leading-none text-white/42">
      <NativeIcon name="discover" className="size-3" />
      {label}
    </span>
  )
}

function PlayGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn('shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 5.2v13.6L18.7 12 8 5.2Z" />
    </svg>
  )
}

function StoryThumb({ thumb, initials }: { thumb: string; initials: string }) {
  return (
    <div
      className="relative grid size-[84px] shrink-0 place-items-center overflow-hidden rounded-[18px] border border-white/10 text-[2.15rem] font-semibold text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18)] md:size-24"
      style={{ background: thumb }}
      aria-hidden="true"
    >
      <span className="drop-shadow-[0_2px_12px_rgba(0,0,0,0.32)]">
        {initials}
      </span>
    </div>
  )
}

function PodcastCard({
  item
}: {
  item: Extract<(typeof homeBriefingItems)[number], { kind: 'podcast' }>
}) {
  return (
    <article className="my-5 rounded-[22px] border border-white/10 bg-zinc-900/78 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.24)]">
      <div className="flex items-center gap-4">
        <div
          className="relative grid size-28 shrink-0 place-items-center overflow-hidden rounded-[18px] text-[2.55rem] font-semibold text-white"
          style={{ background: item.thumb }}
          aria-hidden="true"
        >
          <span>{item.initials}</span>
          <span className="absolute bottom-3 right-3 grid size-10 place-items-center rounded-full bg-black/32 text-white backdrop-blur-md">
            <PlayGlyph className="size-5 translate-x-px" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.92rem] font-semibold uppercase tracking-[0.12em] text-indigo-400">
            {item.kicker}
          </p>
          <h3 className="mt-1 font-serif text-[1.55rem] leading-[1.05] tracking-normal text-white">
            {item.title}
          </h3>
          <p className="mt-2 text-[0.98rem] leading-none text-white/52">
            {item.source} <span className="px-1.5">·</span> {item.date}{' '}
            <span className="px-1.5">·</span> {item.duration}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-3 py-1.5 text-sm font-semibold text-white/56">
          <NativeIcon name="sidebarOpen" className="size-4 text-indigo-400" />
          {item.chapters} chapters
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-3 py-1.5 text-sm font-semibold text-white/56">
          <NativeIcon name="sidebarOpen" className="size-4 text-indigo-400" />
          Transcript
        </span>
      </div>
    </article>
  )
}

function BriefingRow({
  item
}: {
  item: Exclude<(typeof homeBriefingItems)[number], { kind: 'podcast' }>
}) {
  return (
    <article className="flex gap-4 border-b border-white/10 py-5">
      <div className="min-w-0 flex-1">
        <p className="text-[0.88rem] font-semibold uppercase tracking-[0.14em] text-indigo-400">
          {item.kicker}
        </p>
        <h3 className="mt-2 max-w-[18rem] font-serif text-[1.72rem] leading-[1.02] tracking-normal text-white md:max-w-none md:text-[2rem]">
          {item.title}
        </h3>
        <p className="mt-3 text-[1.05rem] leading-snug text-white/52">
          {item.source} <span className="px-1">·</span> {item.readTime}{' '}
          <SourceBadge label={item.sourceType} />
        </p>
      </div>
      <StoryThumb thumb={item.thumb} initials={item.initials} />
    </article>
  )
}

function GistHomeSurface() {
  return (
    <section
      className="mx-auto flex min-h-0 w-full max-w-[620px] flex-1 flex-col overflow-y-auto px-5 pb-36 pt-2 text-white md:max-w-2xl md:px-6"
      aria-label="Home"
    >
      <p className="pb-8 pt-5 font-serif text-[1.82rem] leading-tight tracking-normal text-white md:text-[2.4rem]">
        Good morning. Here&apos;s your gist.
      </p>

      <WeatherCard />

      <section className="mt-10" aria-label="For you">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-[1rem] font-medium uppercase tracking-[0.18em] text-white/54">
            For You
          </h2>
          <span className="inline-flex items-center gap-2 text-[1rem] text-white/54">
            <NativeIcon name="discover" className="size-4 text-indigo-400" />8
            feeds
          </span>
        </div>

        {homeBriefingItems.map(item =>
          item.kind === 'podcast' ? (
            <PodcastCard key={item.id} item={item} />
          ) : (
            <BriefingRow key={item.id} item={item} />
          )
        )}
      </section>
    </section>
  )
}

export function Chat({
  id: providedId,
  savedMessages = [],
  query,
  isGuest = false,
  isCloudDeployment = false,
  modelSelectorData,
  presentation
}: {
  id?: string
  savedMessages?: UIMessage[]
  query?: string
  isGuest?: boolean
  isCloudDeployment?: boolean
  modelSelectorData?: ModelSelectorData
  presentation?: 'chat' | 'results'
}) {
  const router = useRouter()

  // Generate a stable chatId on the client side
  // - If providedId exists (e.g., /search/[id]), use it for existing chats
  // - Otherwise, generate a new ID (e.g., / homepage for new chats)
  const [chatId, setChatId] = useState(() => providedId || generateId())

  // Callback to reset chat state when user clicks "New" button
  const handleNewChat = () => {
    const newId = generateId()
    setChatId(newId)
    // Clear other chat-related state that persists due to Next.js 16 component caching
    setInput('')
    setUploadedFiles([])
    setErrorModal({
      open: false,
      type: 'general',
      message: ''
    })
  }

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [input, setInput] = useState('')
  const [errorModal, setErrorModal] = useState<{
    open: boolean
    type: 'rate-limit' | 'auth' | 'forbidden' | 'general'
    message: string
    details?: string
  }>({
    open: false,
    type: 'general',
    message: ''
  })

  // Locally-maintained streaming flag exposed through ChatContext so
  // programmatic dispatch sites (e.g. Related-question buttons in
  // spec-block) can throttle clicks. Held in a ref so closures
  // captured by @json-render/react's ActionProvider (which freezes
  // its `handlers` prop via useState(initialHandlers)) can still see
  // the freshest value through `.current`. See lib/contexts/chat-context.tsx.
  const isStreamingRef = useRef(false)
  const showAdaptiveModeAuthModal = useCallback(() => {
    setErrorModal({
      open: true,
      type: 'auth',
      message: ADAPTIVE_MODE_AUTH_REQUIRED_MESSAGE
    })
  }, [setErrorModal])

  const isCurrentAdaptiveModeAuthBlocked = useCallback(
    () =>
      isAdaptiveModeAuthBlocked({
        mode: getCookie('searchMode') === 'adaptive' ? 'adaptive' : 'quick',
        isGuest,
        isCloudDeployment
      }),
    [isGuest, isCloudDeployment]
  )

  const {
    messages,
    status,
    setMessages,
    stop,
    sendMessage,
    regenerate,
    addToolResult,
    error
  } = useChat({
    id: chatId, // use the client-generated or provided chatId
    transport: new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest: ({ messages, trigger, messageId }) => {
        // Simplify by passing AI SDK's default trigger values directly
        const lastMessage = messages[messages.length - 1]
        const messageToRegenerate =
          trigger === 'regenerate-message'
            ? messages.find(m => m.id === messageId)
            : undefined

        return {
          body: {
            trigger, // Use AI SDK's default trigger value directly
            chatId: chatId,
            messageId,
            ...(isGuest ? { messages } : {}),
            message:
              trigger === 'regenerate-message' &&
              messageToRegenerate?.role === 'user'
                ? messageToRegenerate
                : trigger === 'submit-message'
                  ? lastMessage
                  : undefined,
            isNewChat:
              trigger === 'submit-message' &&
              messages.length === 1 &&
              savedMessages.length === 0
          }
        }
      }
    }),
    messages: savedMessages,
    onFinish: () => {
      isStreamingRef.current = false
      window.dispatchEvent(new CustomEvent('chat-history-updated'))
    },
    onError: error => {
      isStreamingRef.current = false
      const publicError = toPublicErrorPayload(error)

      if (publicError.type === 'rate-limit') {
        setErrorModal({
          open: true,
          type: 'rate-limit',
          message: publicError.error,
          details: getPublicRateLimitDetails(publicError)
        })
      } else if (publicError.type === 'auth') {
        setErrorModal({
          open: true,
          type: 'auth',
          message: publicError.error
        })
      } else if (publicError.type === 'forbidden') {
        setErrorModal({
          open: true,
          type: 'forbidden',
          message: publicError.error
        })
      } else {
        toast.error(publicError.error)
      }
    },
    experimental_throttle: 100,
    generateId
  })

  // Keep all request entry points reflected in isStreamingRef so downstream
  // action handlers can reliably reject overlapping sends.
  const safeSendMessage = useCallback<typeof sendMessage>(
    (...args) => {
      if (isCurrentAdaptiveModeAuthBlocked()) {
        showAdaptiveModeAuthModal()
        return Promise.resolve()
      }

      isStreamingRef.current = true
      try {
        return sendMessage(...args)
      } catch (error) {
        isStreamingRef.current = false
        throw error
      }
    },
    [sendMessage, isCurrentAdaptiveModeAuthBlocked, showAdaptiveModeAuthModal]
  )

  const safeRegenerate = useCallback(
    async (...args: Parameters<typeof regenerate>) => {
      if (isCurrentAdaptiveModeAuthBlocked()) {
        showAdaptiveModeAuthModal()
        return
      }

      isStreamingRef.current = true
      try {
        return await regenerate(...args)
      } catch (error) {
        isStreamingRef.current = false
        throw error
      }
    },
    [regenerate, isCurrentAdaptiveModeAuthBlocked, showAdaptiveModeAuthModal]
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }

  // Convert messages array to sections array.
  // Deduplicate by message.id — @ai-sdk/react useChat can occasionally
  // surface the same assistant message twice during stream finalization,
  // which would otherwise produce React 'duplicate key' warnings in
  // chat-messages.tsx (one warning per re-render).
  const sections = useMemo<ChatSection[]>(() => {
    const result: ChatSection[] = []
    const seenIds = new Set<string>()
    let currentSection: ChatSection | null = null

    for (const message of messages) {
      if (seenIds.has(message.id)) continue
      seenIds.add(message.id)

      if (message.role === 'user') {
        if (currentSection) {
          result.push(currentSection)
        }
        currentSection = {
          id: message.id,
          userMessage: message,
          assistantMessages: []
        }
      } else if (currentSection && message.role === 'assistant') {
        currentSection.assistantMessages.push(message)
      }
    }

    if (currentSection) {
      result.push(currentSection)
    }

    return result
  }, [messages])

  // Listen for copy message shortcut
  // Uses ref to avoid re-registering listener on every messages change.
  // Uses defaultPrevented + visibility check to prevent duplicate handling
  // when multiple Chat instances are mounted (Next.js component caching).
  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    const handleCopyMessage = (e: Event) => {
      if (e.defaultPrevented) return
      // Only handle in the visible (active) Chat instance
      if (!scrollContainerRef.current?.offsetParent) return
      e.preventDefault()

      const assistantMessages = messagesRef.current.filter(
        m => m.role === 'assistant'
      )
      const lastAssistant = assistantMessages[assistantMessages.length - 1]
      if (!lastAssistant) {
        toast.info('No assistant message to copy')
        return
      }
      const text =
        lastAssistant.parts
          ?.filter(
            (p): p is { type: 'text'; text: string } => p.type === 'text'
          )
          .map(p => p.text)
          .join('\n') ?? ''

      if (text) {
        navigator.clipboard.writeText(stripSpecBlocks(text)).then(
          () => toast.success('Message copied to clipboard'),
          () => toast.error('Failed to copy message')
        )
      }
    }

    window.addEventListener(SHORTCUT_EVENTS.copyMessage, handleCopyMessage)
    return () =>
      window.removeEventListener(SHORTCUT_EVENTS.copyMessage, handleCopyMessage)
  }, [])

  // Dispatch custom event when messages change
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('messages-changed', {
        detail: { hasMessages: messages.length > 0 }
      })
    )
  }, [messages.length])

  // Detect if scroll container is at the bottom
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const updateIsAtBottom = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const threshold = 50 // threshold in pixels
      setIsAtBottom(scrollHeight - scrollTop - clientHeight < threshold)
    }

    const handleScroll = () => {
      updateIsAtBottom()
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    const frame = requestAnimationFrame(updateIsAtBottom)

    return () => {
      cancelAnimationFrame(frame)
      container.removeEventListener('scroll', handleScroll)
    }
  }, [messages.length])

  // Check scroll position when messages change (during generation)
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const frame = requestAnimationFrame(() => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const threshold = 50
      setIsAtBottom(scrollHeight - scrollTop - clientHeight < threshold)
    })

    return () => cancelAnimationFrame(frame)
  }, [messages])

  // Scroll to the section when a new user message is sent
  useEffect(() => {
    // Only scroll if this chat is currently visible in the URL
    const isCurrentChat =
      window.location.pathname === `/search/${chatId}` ||
      (window.location.pathname === '/' && sections.length > 0)

    if (isCurrentChat && sections.length > 0) {
      const lastMessage = messages[messages.length - 1]
      if (lastMessage && lastMessage.role === 'user') {
        // If the last message is from user, find the corresponding section
        const sectionId = lastMessage.id
        requestAnimationFrame(() => {
          const sectionElement = document.getElementById(`section-${sectionId}`)
          sectionElement?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      }
    }
  }, [sections, messages, chatId])

  const handleUpdateAndReloadMessage = async (
    editedMessageId: string,
    newContentText: string
  ) => {
    if (!chatId) {
      toast.error('Chat ID is missing.')
      console.error('handleUpdateAndReloadMessage: chatId is undefined.')
      return
    }

    try {
      // Update the message locally with the same ID
      setMessages(prevMessages => {
        const messageIndex = prevMessages.findIndex(
          m => m.id === editedMessageId
        )
        if (messageIndex === -1) return prevMessages

        const updatedMessages = [...prevMessages]
        updatedMessages[messageIndex] = {
          ...updatedMessages[messageIndex],
          parts: [{ type: 'text', text: newContentText }]
        }

        return updatedMessages
      })

      // Regenerate from this message
      await safeRegenerate({ messageId: editedMessageId })
    } catch (error) {
      console.error('Error during message edit and reload process:', error)
      toast.error(toPublicErrorPayload(error).error)
    }
  }

  const handleReloadFrom = async (reloadFromFollowerMessageId: string) => {
    if (!chatId) {
      toast.error('Chat ID is missing for reload.')
      return
    }

    try {
      // Use the SDK's regenerate function with the specific messageId
      await safeRegenerate({ messageId: reloadFromFollowerMessageId })
    } catch (error) {
      console.error(
        `Error during reload from message ${reloadFromFollowerMessageId}:`,
        error
      )
      toast.error(toPublicErrorPayload(error).error)
    }
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const uploaded = uploadedFiles.filter(f => f.status === 'uploaded')

    if (input.trim() || uploaded.length > 0) {
      const parts: any[] = []

      if (input.trim()) {
        parts.push({ type: 'text', text: input })
      }

      uploaded.forEach(f => {
        parts.push({
          type: 'file',
          url: f.url!,
          filename: f.name!,
          mediaType: f.file.type
        })
      })

      safeSendMessage({ role: 'user', parts })
      setInput('')
      setUploadedFiles([])

      // Push URL state immediately after sending message (for new chats)
      // Check if we're on the root path (new chat)
      if (!isGuest && window.location.pathname === '/') {
        window.history.pushState({}, '', `/search/${chatId}`)
      }
    }
  }

  const { isDragging, handleDragOver, handleDragLeave, handleDrop } =
    useFileDropzone({
      uploadedFiles,
      setUploadedFiles,
      chatId: chatId
    })
  const guestDragHandlers = {
    isDragging: false,
    handleDragOver: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
    },
    handleDragLeave: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
    },
    handleDrop: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
    }
  }
  const dragHandlers = isGuest
    ? guestDragHandlers
    : { isDragging, handleDragOver, handleDragLeave, handleDrop }
  const effectivePresentation =
    presentation ?? (messages.length > 0 ? 'results' : 'chat')

  return (
    <ChatProvider sendMessage={safeSendMessage} isStreamingRef={isStreamingRef}>
      <div
        className={cn(
          'relative flex h-full min-w-0 flex-1 flex-col',
          (effectivePresentation === 'results' || messages.length === 0) &&
            'bg-black text-white',
          messages.length === 0 ? 'items-stretch justify-start' : ''
        )}
        data-testid="full-chat"
        onDragOver={dragHandlers.handleDragOver}
        onDragLeave={dragHandlers.handleDragLeave}
        onDrop={dragHandlers.handleDrop}
      >
        {messages.length === 0 && <GistHomeSurface />}
        <ChatMessages
          sections={sections}
          presentation={effectivePresentation}
          status={status}
          chatId={chatId}
          isGuest={isGuest}
          addToolResult={({
            toolCallId,
            result
          }: {
            toolCallId: string
            result: any
          }) => {
            // Find the tool name from the message parts
            let toolName = 'unknown'

            // Optimize by breaking early once found
            outerLoop: for (const message of messages) {
              if (!message.parts) continue

              for (const part of message.parts) {
                if (isToolCallPart(part) && part.toolCallId === toolCallId) {
                  toolName = part.toolName
                  break outerLoop
                } else if (
                  isToolTypePart(part) &&
                  part.toolCallId === toolCallId
                ) {
                  toolName = part.type.substring(5) // Remove 'tool-' prefix
                  break outerLoop
                } else if (
                  isDynamicToolPart(part) &&
                  part.toolCallId === toolCallId
                ) {
                  toolName = part.toolName
                  break outerLoop
                }
              }
            }

            addToolResult({ tool: toolName, toolCallId, output: result })
          }}
          scrollContainerRef={scrollContainerRef}
          onUpdateMessage={handleUpdateAndReloadMessage}
          reload={handleReloadFrom}
          error={error}
        />
        <ChatPanel
          chatId={chatId}
          input={input}
          handleInputChange={handleInputChange}
          handleSubmit={onSubmit}
          status={status}
          messages={messages}
          setMessages={setMessages}
          stop={stop}
          query={query}
          append={(message: any) => {
            safeSendMessage(message)
          }}
          showScrollToBottomButton={!isAtBottom}
          uploadedFiles={uploadedFiles}
          setUploadedFiles={setUploadedFiles}
          scrollContainerRef={scrollContainerRef}
          onNewChat={handleNewChat}
          isGuest={isGuest}
          isCloudDeployment={isCloudDeployment}
          onAdaptiveModeAuthRequired={showAdaptiveModeAuthModal}
          modelSelectorData={modelSelectorData}
          sections={sections}
        />
        <DragOverlay visible={dragHandlers.isDragging} />
        <ErrorModal
          open={errorModal.open}
          onOpenChange={open => setErrorModal(prev => ({ ...prev, open }))}
          error={errorModal}
          onRetry={
            errorModal.type !== 'rate-limit'
              ? () => {
                  // Retry the last message if not rate limited
                  if (messages.length > 0) {
                    const lastUserMessage = messages
                      .filter(m => m.role === 'user')
                      .pop()
                    if (lastUserMessage) {
                      safeSendMessage(lastUserMessage)
                    }
                  }
                }
              : undefined
          }
          onAuthClose={() => {
            // Clear messages and navigate to root
            setMessages([])
            router.push('/')
          }}
        />
      </div>
    </ChatProvider>
  )
}
