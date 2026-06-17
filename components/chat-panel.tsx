'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import Textarea from 'react-textarea-autosize'
import { useRouter } from 'next/navigation'

import { UseChatHelpers } from '@ai-sdk/react'
import { toast } from 'sonner'

import { SHORTCUT_EVENTS } from '@/lib/keyboard-shortcuts'
import {
  isAdaptiveModeAuthBlocked,
  requiresAdaptiveModeAuth
} from '@/lib/search-mode-availability'
import { UploadedFile } from '@/lib/types'
import type { UIDataTypes, UIMessage, UITools } from '@/lib/types/ai'
import type { ModelSelectorData } from '@/lib/types/model-selector'
import type { SearchMode } from '@/lib/types/search'
import { cn } from '@/lib/utils'
import {
  getCookie,
  setCookie,
  subscribeToCookieChange
} from '@/lib/utils/cookies'

import { useArtifact } from './artifact/artifact-context'
import { NativeIcon } from './native/native-icon'
import { NativePressable } from './native/native-pressable'
import { Button } from './ui/button'
import { IconBlinkingLogo } from './ui/icons'
import { ActionButtons } from './action-buttons'
import { FileUploadButton } from './file-upload-button'
import { MessageNavigationDots } from './message-navigation-dots'
import { ModelSelectorClient } from './model-selector-client'
import { SearchModeSelector } from './search-mode-selector'
import { UploadedFileList } from './uploaded-file-list'

// Constants for timing delays
const INPUT_UPDATE_DELAY_MS = 10 // Delay to ensure input value is updated before form submission

function getSearchModeSnapshot(): SearchMode {
  return getCookie('searchMode') === 'adaptive' ? 'adaptive' : 'quick'
}

interface ChatPanelProps {
  chatId: string
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  status: UseChatHelpers<UIMessage<unknown, UIDataTypes, UITools>>['status']
  messages: UIMessage[]
  setMessages: (messages: UIMessage[]) => void
  query?: string
  stop: () => void
  append: (message: any) => void
  /** Whether to show the scroll to bottom button */
  showScrollToBottomButton: boolean
  /** Reference to the scroll container */
  scrollContainerRef: React.RefObject<HTMLDivElement>
  uploadedFiles: UploadedFile[]
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>
  /** Callback to reset chatId when starting a new chat */
  onNewChat?: () => void
  /** Whether the current session is guest */
  isGuest?: boolean
  /** Whether the deployment is cloud mode */
  isCloudDeployment?: boolean
  onAdaptiveModeAuthRequired?: () => void
  modelSelectorData?: ModelSelectorData
  /** Chat sections for message navigation dots */
  sections?: { id: string; userMessage: UIMessage }[]
}

export function ChatPanel({
  chatId,
  input,
  handleInputChange,
  handleSubmit,
  status,
  messages,
  setMessages,
  query,
  stop,
  append,
  showScrollToBottomButton,
  uploadedFiles,
  setUploadedFiles,
  scrollContainerRef,
  onNewChat,
  isGuest = false,
  isCloudDeployment = false,
  onAdaptiveModeAuthRequired,
  modelSelectorData,
  sections = []
}: ChatPanelProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isFirstRender = useRef(true)
  const [isComposing, setIsComposing] = useState(false) // Composition state
  const [enterDisabled, setEnterDisabled] = useState(false) // Disable Enter after composition ends
  const [isInputFocused, setIsInputFocused] = useState(false) // Track input focus
  const { close: closeArtifact } = useArtifact()
  const isLoading = status === 'submitted' || status === 'streaming'
  const hasAvailableModels =
    isCloudDeployment || modelSelectorData?.hasAvailableModels !== false
  const searchMode = useSyncExternalStore(
    subscribeToCookieChange,
    getSearchModeSnapshot,
    () => 'quick' as SearchMode
  )
  const isAdaptiveAuthRequired = requiresAdaptiveModeAuth({
    isGuest,
    isCloudDeployment
  })
  const adaptiveModeSubmitBlocked = isAdaptiveModeAuthBlocked({
    mode: searchMode,
    isGuest,
    isCloudDeployment
  })

  const handleCompositionStart = () => setIsComposing(true)

  const handleCompositionEnd = () => {
    setIsComposing(false)
    // Brief debounce — the candidate-confirm Enter that fires
    // immediately after compositionend may otherwise be treated as a
    // submit. 50ms is enough to swallow that synchronous event but
    // short enough not to drop a real "finish typing, press Enter".
    setEnterDisabled(true)
    setTimeout(() => {
      setEnterDisabled(false)
    }, 50)
  }

  const handleNewChat = useCallback(() => {
    setMessages([])
    closeArtifact()
    // Reset focus state when clearing chat
    setIsInputFocused(false)
    inputRef.current?.blur()
    // Reset chatId in parent component
    onNewChat?.()
    router.push('/')
  }, [setMessages, closeArtifact, onNewChat, router])

  // Listen for keyboard shortcut events
  // Uses defaultPrevented to prevent duplicate handling
  // when multiple ChatPanel instances are mounted (Next.js component caching)
  const handleNewChatRef = useRef(handleNewChat)
  useEffect(() => {
    handleNewChatRef.current = handleNewChat
  }, [handleNewChat])

  useEffect(() => {
    const handleNewChatShortcut = (e: Event) => {
      if (e.defaultPrevented) return
      e.preventDefault()
      handleNewChatRef.current()
    }

    window.addEventListener(SHORTCUT_EVENTS.newChat, handleNewChatShortcut)
    return () => {
      window.removeEventListener(SHORTCUT_EVENTS.newChat, handleNewChatShortcut)
    }
  }, [])

  const isToolInvocationInProgress = () => {
    if (!messages.length) return false

    const lastMessage = messages[messages.length - 1]
    if (lastMessage.role !== 'assistant' || !lastMessage.parts) return false

    const parts = lastMessage.parts
    const lastPart = parts[parts.length - 1]

    return (
      (lastPart?.type === 'tool-search' ||
        lastPart?.type === 'tool-feedSearch' ||
        lastPart?.type === 'tool-fetch' ||
        lastPart?.type === 'tool-researchSubtask' ||
        lastPart?.type === 'tool-mapSearch' ||
        lastPart?.type === 'tool-askQuestion') &&
      ((lastPart as any)?.state === 'input-streaming' ||
        (lastPart as any)?.state === 'input-available')
    )
  }

  // if query is not empty, submit the query
  useEffect(() => {
    if (isFirstRender.current && query && query.trim().length > 0) {
      if (adaptiveModeSubmitBlocked) {
        setCookie('searchMode', 'quick')
        return
      }

      append({
        role: 'user',
        parts: [{ type: 'text', text: query }]
      })
      isFirstRender.current = false
    }
  }, [adaptiveModeSubmitBlocked, append, query])

  const handleFileRemove = useCallback(
    (index: number) => {
      setUploadedFiles(prev => prev.filter((_, i) => i !== index))
    },
    [setUploadedFiles]
  )
  // Scroll to the bottom of the container
  const handleScrollToBottom = () => {
    const scrollContainer = scrollContainerRef.current
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: 'smooth'
      })
    }
  }

  return (
    <div
      className={cn(
        'w-full bg-background group/form-container shrink-0',
        messages.length > 0
          ? 'sticky bottom-0 px-2 pb-2 md:pb-4'
          : 'px-4 md:px-6'
      )}
    >
      {messages.length === 0 && (
        <div className="mb-6 md:mb-10 flex flex-col items-center gap-2 md:gap-4">
          <IconBlinkingLogo className="size-12" />
          <h1 className="text-xl md:text-2xl font-medium text-foreground">
            What would you like to know?
          </h1>
        </div>
      )}
      {uploadedFiles.length > 0 && (
        <UploadedFileList files={uploadedFiles} onRemove={handleFileRemove} />
      )}
      <form
        onSubmit={e => {
          if (adaptiveModeSubmitBlocked) {
            e.preventDefault()
            onAdaptiveModeAuthRequired?.()
            return
          }

          if (!hasAvailableModels) {
            e.preventDefault()
            toast.error('No enabled model is available')
            return
          }
          handleSubmit(e)
        }}
        className={cn(
          'relative w-full max-w-3xl mx-auto flex flex-col gap-2 p-3 rounded-[28px] border border-border bg-muted/50 shadow-lg',
          messages.length > 0 ? 'md:max-w-4xl' : '',
          isInputFocused ? 'ring-2 ring-ring/40' : ''
        )}
      >
        <Textarea
          ref={inputRef}
          name="input"
          rows={1}
          maxRows={8}
          tabIndex={0}
          autoFocus
          placeholder="Ask anything…"
          spellCheck={false}
          value={input}
          onChange={handleInputChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => setIsInputFocused(false)}
          className="resize-none bg-transparent w-full px-2 py-2 outline-none text-base text-foreground placeholder:text-muted-foreground"
          onKeyDown={e => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !isComposing &&
              !enterDisabled
            ) {
              if (isToolInvocationInProgress()) {
                e.preventDefault()
                toast.info('Waiting for the current tool call to finish…')
                return
              }
              e.preventDefault()
              const form = e.currentTarget.form
              if (form) {
                setTimeout(() => {
                  form.requestSubmit()
                }, INPUT_UPDATE_DELAY_MS)
              }
            }
          }}
        />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <FileUploadButton disabled={isGuest || isLoading} />
            <ActionButtons
              disabled={isLoading}
              isUserAuthenticated={!isGuest}
              isCloudDeployment={isCloudDeployment}
            />
            <SearchModeSelector disabled={isLoading} />
            <ModelSelectorClient
              modelSelectorData={modelSelectorData}
              isGuest={isGuest}
              isCloudDeployment={isCloudDeployment}
            />
          </div>

          <div className="flex items-center gap-1">
            {sections.length > 0 && (
              <MessageNavigationDots
                sections={sections}
                scrollContainerRef={scrollContainerRef}
              />
            )}
            {messages.length > 0 && showScrollToBottomButton && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleScrollToBottom}
                aria-label="Scroll to bottom"
              >
                <NativeIcon name="arrowDown" className="size-4" />
              </Button>
            )}
            {isLoading ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={stop}
                aria-label="Stop generating"
              >
                <NativeIcon name="stop" className="size-4" />
              </Button>
            ) : (
              <NativePressable
                asChild
                haptic="light"
                className="rounded-full"
                disabled={
                  (!input.trim() && uploadedFiles.length === 0) ||
                  adaptiveModeSubmitBlocked ||
                  !hasAvailableModels
                }
              >
                <Button
                  type="submit"
                  size="icon"
                  aria-label={
                    adaptiveModeSubmitBlocked
                      ? isAdaptiveAuthRequired
                        ? 'Sign in to use Adaptive mode'
                        : 'Adaptive mode unavailable'
                      : !hasAvailableModels
                        ? 'No enabled model is available'
                        : 'Send message'
                  }
                  disabled={
                    (!input.trim() && uploadedFiles.length === 0) ||
                    adaptiveModeSubmitBlocked ||
                    !hasAvailableModels
                  }
                >
                  <NativeIcon name="arrowUp" className="size-4" />
                </Button>
              </NativePressable>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}
