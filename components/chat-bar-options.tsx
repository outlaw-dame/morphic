'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import Image from 'next/image'

import { toast } from 'sonner'

import {
  MODEL_SELECTION_COOKIE,
  serializeModelSelectionCookie
} from '@/lib/config/model-selection-cookie'
import { SEARCH_MODE_CONFIGS } from '@/lib/config/search-modes'
import type { ModelSelectorData } from '@/lib/types/model-selector'
import type { Model } from '@/lib/types/models'
import type { SearchMode } from '@/lib/types/search'
import { cn } from '@/lib/utils'
import {
  getCookie,
  setCookie,
  subscribeToCookieChange
} from '@/lib/utils/cookies'

import { NativeIcon } from './native/native-icon'
import { NativePressable } from './native/native-pressable'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from './ui/command'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

const VALID_SEARCH_MODES = new Set(['quick', 'adaptive'])
const ALLOWED_UPLOAD_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'application/pdf'
])

const PROVIDER_LOGO_BY_ID: Record<string, string> = {
  openai: '/providers/logos/openai.svg',
  anthropic: '/providers/logos/anthropic.svg',
  google: '/providers/logos/google.svg',
  gateway: '/providers/logos/gateway.svg',
  'openai-compatible': '/providers/logos/openai-compatible.svg',
  ollama: '/providers/logos/ollama.svg',
  openrouter: '/providers/logos/openrouter.svg'
}

function getSearchModeSnapshot(): SearchMode {
  const savedMode = getCookie('searchMode')
  return savedMode === 'adaptive' ? 'adaptive' : 'quick'
}

function modelKey(model: Model): string {
  return `${model.providerId}:${model.id}`
}

function ProviderLogo({ providerId }: { providerId: string }) {
  const logoSrc = PROVIDER_LOGO_BY_ID[providerId]
  if (!logoSrc) {
    return <span className="size-8 rounded-lg bg-white/90" />
  }

  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white">
      <Image
        src={logoSrc}
        alt={`${providerId} logo`}
        width={18}
        height={18}
        className="size-[18px] object-contain"
      />
    </span>
  )
}

function isAllowedFileType(file: File) {
  return ALLOWED_UPLOAD_TYPES.has(file.type)
}

interface ChatBarOptionsProps {
  modelSelectorData?: ModelSelectorData
  isGuest?: boolean
  isAdaptiveAuthRequired?: boolean
  onAdaptiveAuthRequired?: () => void
  onFileSelect: (files: File[]) => void
  className?: string
}

export function ChatBarOptions({
  modelSelectorData,
  isGuest = false,
  isAdaptiveAuthRequired = false,
  onAdaptiveAuthRequired,
  onFileSelect,
  className
}: ChatBarOptionsProps) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchMode = useSyncExternalStore(
    subscribeToCookieChange,
    getSearchModeSnapshot,
    () => 'quick' as SearchMode
  )
  const [selectedModelKey, setSelectedModelKey] = useState(
    modelSelectorData?.selectedModelKey
  )

  const providerEntries = useMemo(
    () =>
      Object.entries(modelSelectorData?.modelsByProvider ?? {}).sort(
        ([providerA], [providerB]) => providerA.localeCompare(providerB)
      ),
    [modelSelectorData?.modelsByProvider]
  )

  const selectableModels = useMemo(
    () => providerEntries.flatMap(([, models]) => models),
    [providerEntries]
  )

  const selectableByKey = useMemo(
    () =>
      Object.fromEntries(
        selectableModels.map(model => [modelKey(model), model])
      ) as Record<string, Model>,
    [selectableModels]
  )

  const effectiveSelectedModelKey =
    selectedModelKey && selectableByKey[selectedModelKey]
      ? selectedModelKey
      : modelSelectorData?.selectedModelKey

  useEffect(() => {
    const savedMode = getCookie('searchMode')
    if (savedMode && !VALID_SEARCH_MODES.has(savedMode)) {
      setCookie('searchMode', 'quick')
      return
    }

    if (isAdaptiveAuthRequired && savedMode === 'adaptive') {
      setCookie('searchMode', 'quick')
    }
  }, [isAdaptiveAuthRequired])

  const handleModeSelect = (mode: SearchMode) => {
    if (mode === 'adaptive' && isAdaptiveAuthRequired) {
      setCookie('searchMode', 'quick')
      onAdaptiveAuthRequired?.()
      return
    }

    setCookie('searchMode', mode)
  }

  const handleFiles = (files: FileList | null) => {
    if (!files) return

    const fileArray = Array.from(files).slice(0, 3)
    const validFiles = fileArray.filter(isAllowedFileType)
    const rejected = fileArray.filter(file => !isAllowedFileType(file))

    if (rejected.length > 0) {
      toast.error(
        'Some files were not accepted: ' +
          rejected.map(file => file.name).join(', ')
      )
    }

    if (validFiles.length > 0) {
      onFileSelect(validFiles)
      setOpen(false)
    }
  }

  const hasModelSelection =
    modelSelectorData?.enabled && modelSelectorData.hasAvailableModels

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <NativePressable
          type="button"
          pressScale={0.94}
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-full text-white/72 transition-colors hover:text-white',
            open && 'bg-white/8 text-[#665cff] ring-2 ring-[#2f8cff]',
            className
          )}
          aria-label="Open model and search options"
        >
          <NativeIcon name="controls" className="size-5" />
        </NativePressable>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={12}
        className="w-[min(380px,calc(100vw-3rem))] rounded-[22px] border-white/10 bg-[#202022] p-0 text-white shadow-[0_22px_70px_rgba(0,0,0,0.45)]"
      >
        <div className="p-3">
          <p className="px-2 pb-2 text-xs font-medium uppercase tracking-[0.16em] text-white/42">
            Model
          </p>
          {hasModelSelection ? (
            <Command className="rounded-[18px] bg-transparent text-white">
              <CommandInput
                placeholder="Search models"
                className="text-base text-white placeholder:text-white/40"
              />
              <CommandList className="max-h-[300px]">
                <CommandEmpty>No model found.</CommandEmpty>
                {providerEntries.map(([provider, models]) => (
                  <CommandGroup key={provider} heading={provider}>
                    {models.map(model => {
                      const value = modelKey(model)
                      const isSelected = effectiveSelectedModelKey === value
                      return (
                        <CommandItem
                          key={value}
                          value={`${value} ${model.name} ${provider}`}
                          onSelect={() => {
                            const nextModel = selectableByKey[value]
                            if (!nextModel) return

                            setSelectedModelKey(value)
                            setCookie(
                              MODEL_SELECTION_COOKIE,
                              serializeModelSelectionCookie({
                                providerId: nextModel.providerId,
                                modelId: nextModel.id
                              })
                            )
                          }}
                          className={cn(
                            'cursor-pointer rounded-[14px] px-3 py-3 text-white aria-selected:bg-white/8',
                            isSelected && 'bg-white/10'
                          )}
                        >
                          <ProviderLogo providerId={model.providerId} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-base font-medium">
                              {model.name}
                            </span>
                            <span className="block truncate text-sm text-white/48">
                              {model.provider}
                            </span>
                          </span>
                          {isSelected ? (
                            <NativeIcon
                              name="check"
                              className="size-5 text-[#665cff]"
                            />
                          ) : null}
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          ) : (
            <div className="rounded-[16px] bg-white/8 px-4 py-3 text-sm text-white/56">
              No enabled model available.
            </div>
          )}
        </div>

        <div className="mx-4 border-t border-white/10 py-3">
          <p className="px-1 pb-2 text-xs font-medium uppercase tracking-[0.16em] text-white/42">
            Mode
          </p>
          <div className="grid grid-cols-2 rounded-[16px] bg-white/10 p-1">
            {SEARCH_MODE_CONFIGS.map(config => {
              const selected = searchMode === config.value
              return (
                <button
                  key={config.value}
                  type="button"
                  onClick={() => handleModeSelect(config.value)}
                  className={cn(
                    'inline-flex min-h-11 items-center justify-center gap-2 rounded-[13px] text-sm font-semibold text-white/55 transition-colors',
                    selected && 'bg-black/35 text-white'
                  )}
                  aria-pressed={selected}
                >
                  <NativeIcon
                    name={config.icon}
                    className={cn('size-4', config.color)}
                  />
                  {config.label}
                </button>
              )
            })}
          </div>
        </div>

        {!isGuest ? (
          <div className="mx-4 border-t border-white/10 py-3">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              hidden
              multiple
              onChange={event => {
                handleFiles(event.target.files)
                event.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex min-h-12 w-full items-center gap-3 rounded-[14px] px-3 text-left text-base font-medium text-white transition-colors hover:bg-white/8"
            >
              <NativeIcon name="attachment" className="size-6 text-white/70" />
              Attach file
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
