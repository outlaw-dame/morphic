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
import { ChatBarOptions } from './chat-bar-options'
import { MessageNavigationDots } from './message-navigation-dots'
import { UploadedFileList } from './uploaded-file-list'

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
  const isHome = messages.length === 0
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
        content: query
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

  const handleFileSelect = useCallback(
    async (files: File[]) => {
      const newFiles: UploadedFile[] = files.map(file => ({
        file,
        status: 'uploading'
      }))
      setUploadedFiles(prev => [...prev, ...newFiles])

      await Promise.all(
        newFiles.map(async uf => {
          const formData = new FormData()
          formData.append('file', uf.file)
          formData.append('chatId', chatId)

          try {
            const res = await fetch('/api/upload', {
              method: 'POST',
              body: formData
            })

            if (!res.ok) {
              throw new Error('Upload failed')
            }

            const { file: uploaded } = await res.json()
            setUploadedFiles(prev =>
              prev.map(f =>
                f.file === uf.file
                  ? {
                      ...f,
                      status: 'uploaded',
                      url: uploaded.url,
                      name: uploaded.filename,
                      key: uploaded.key
                    }
                  : f
              )
            )
          } catch (e) {
            toast.error(`Failed to upload ${uf.file.name}`)
            setUploadedFiles(prev =>
              prev.map(f =>
                f.file === uf.file ? { ...f, status: 'error' } : f
              )
            )
          }
        })
      )
    },
    [chatId, setUploadedFiles]
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
        'w-full group/form-container shrink-0',
        !isHome
          ? 'sticky bottom-0 bg-black/88 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 backdrop-blur-xl md:pb-4'
          : 'sticky bottom-0 bg-black px-5 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 md:px-6 md:pb-5'
      )}
    >
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
          // Reset focus state after submission
          setIsInputFocused(false)
          inputRef.current?.blur()
        }}
        className={cn(
          'max-w-full md:max-w-3xl w-full mx-auto relative flex items-center gap-3',
          isHome && 'max-w-[620px]'
        )}
      >
        {(messages.length > 0 || isHome) && (
          <NativePressable
            onClick={handleNewChat}
            className={cn(
              'flex shrink-0 items-center justify-center bg-white/10 text-white shadow-[0_12px_32px_rgba(0,0,0,0.28)]',
              isHome
                ? 'size-14 rounded-[18px] bg-[#1f1f22]/95'
                : 'size-12 rounded-[16px] bg-[#1f1f22]/95'
            )}
            type="button"
            disabled={isLoading}
            title="Back to home"
          >
            <NativeIcon name="home" className="size-6" />
          </NativePressable>
        )}

        {/* Scroll to bottom button */}
        {messages.length > 0 && (
          <div
            className={cn(
              'transition-opacity duration-[120ms] ease-[var(--motion-ease-out)]',
              showScrollToBottomButton
                ? 'opacity-100'
                : 'pointer-events-none opacity-0'
            )}
          >
            <NativePressable
              type="button"
              className="absolute -top-10 right-0 z-20 flex size-8 items-center justify-center rounded-full border border-input bg-background shadow-md"
              onClick={handleScrollToBottom}
              title="Scroll to bottom"
            >
              <NativeIcon name="scrollDown" size={16} />
            </NativePressable>
          </div>
        )}
        {/* Message navigation dots */}
        {sections.length > 0 && (
          <div
            className={cn(
              'transition-opacity duration-[120ms] ease-[var(--motion-ease-out)]',
              !showScrollToBottomButton && status === 'ready'
                ? 'opacity-100'
                : 'pointer-events-none opacity-0'
            )}
          >
            <MessageNavigationDots sections={sections} />
          </div>
        )}

        <div
          className={cn(
            'relative flex min-h-[56px] w-full flex-1 items-center gap-1 rounded-full border border-white/10 bg-[#1f1f22] px-2 py-1 text-white shadow-[0_16px_48px_rgba(0,0,0,0.3)] backdrop-blur-xl transition-[box-shadow] duration-[140ms] ease-[var(--motion-ease-out)]',
            isInputFocused &&
              'ring-1 ring-[#665cff]/70 ring-offset-1 ring-offset-black/80'
          )}
        >
          <ChatBarOptions
            modelSelectorData={modelSelectorData}
            isGuest={isGuest}
            isAdaptiveAuthRequired={isAdaptiveAuthRequired}
            onAdaptiveAuthRequired={onAdaptiveModeAuthRequired}
            onFileSelect={handleFileSelect}
          />
          <Textarea
            ref={inputRef}
            name="input"
            rows={1}
            maxRows={4}
            tabIndex={0}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            placeholder={
              messages.length > 0 ? 'Ask anything...' : 'Ask anything...'
            }
            spellCheck={false}
            value={input}
            disabled={isLoading || isToolInvocationInProgress()}
            className={cn(
              'min-h-0 w-full flex-1 resize-none border-0 bg-transparent px-2 py-2 text-base leading-6 text-white placeholder:text-white/42 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 md:text-base'
            )}
            onChange={handleInputChange}
            onKeyDown={e => {
              // e.nativeEvent.isComposing stays true on the keydown that
              // confirms an IME candidate, even after React-level
              // isComposing has flipped.
              if (
                e.key !== 'Enter' ||
                isComposing ||
                (e.nativeEvent as KeyboardEvent).isComposing ||
                enterDisabled
              ) {
                return
              }

              // Plain Enter (no modifiers) → submit
              if (!e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
                if (input.trim().length === 0) {
                  e.preventDefault()
                  return
                }
                e.preventDefault()
                const textarea = e.target as HTMLTextAreaElement
                textarea.form?.requestSubmit()
                setIsInputFocused(false)
                textarea.blur()
                return
              }

              // Shift+Enter falls through to textarea default (inserts \n).
              // Alt/Option+Enter on macOS does NOT insert \n by default,
              // so insert it manually to match user expectation.
              if (e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault()
                const textarea = e.target as HTMLTextAreaElement
                const start = textarea.selectionStart ?? input.length
                const end = textarea.selectionEnd ?? input.length
                const next = input.slice(0, start) + '\n' + input.slice(end)
                handleInputChange({
                  target: { value: next }
                } as React.ChangeEvent<HTMLTextAreaElement>)
                requestAnimationFrame(() => {
                  textarea.selectionStart = textarea.selectionEnd = start + 1
                })
              }
            }}
          />

          <NativePressable
            type={isLoading ? 'button' : 'submit'}
            className={cn(
              'grid size-11 shrink-0 place-items-center rounded-full bg-[#665cff] text-white',
              isLoading && 'animate-pulse',
              ((input.length === 0 && !isLoading) || !hasAvailableModels) &&
                'pointer-events-none opacity-50'
            )}
            disabled={(input.length === 0 && !isLoading) || !hasAvailableModels}
            onClick={isLoading ? stop : undefined}
            title={
              hasAvailableModels ? undefined : 'No enabled model is available'
            }
          >
            {isLoading ? (
              <NativeIcon name="stop" className="size-5" />
            ) : isHome ? (
              <NativeIcon name="search" className="size-5" />
            ) : (
              <NativeIcon name="send" className="size-5" />
            )}
          </NativePressable>
        </div>
      </form>
    </div>
  )
}
