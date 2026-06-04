'use client'

import {
  IconAlertCircle as AlertCircle,
  IconCheck as Check,
  IconExternalLink as ExternalLink,
  IconMathFunction as MathFunction
} from '@tabler/icons-react'

import { toPublicErrorPayload } from '@/lib/errors/public-error'
import type { ToolPart } from '@/lib/types/ai'
import type { WolframAlphaResult } from '@/lib/types/wolfram'
import { cn } from '@/lib/utils'

import ProcessHeader from './process-header'

interface WolframSectionProps {
  tool: ToolPart<'wolframAlpha'>
  borderless?: boolean
  isFirst?: boolean
  isLast?: boolean
}

export function WolframSection({
  tool,
  borderless = false,
  isFirst = false,
  isLast = false
}: WolframSectionProps) {
  const output =
    tool.state === 'output-available'
      ? (tool.output as WolframAlphaResult | { state: 'computing' })
      : undefined
  const isComputing =
    tool.state === 'input-streaming' ||
    tool.state === 'input-available' ||
    output?.state === 'computing'
  const result = output?.state === 'complete' ? output : undefined
  const query = tool.input?.query || result?.query || 'Wolfram|Alpha'

  const error =
    tool.state === 'output-error'
      ? toPublicErrorPayload(tool.errorText, {
          fallbackMessage: 'Wolfram|Alpha query failed'
        }).error
      : undefined

  const openResult = () => {
    if (result?.url) window.open(result.url, '_blank', 'noopener,noreferrer')
  }

  const header = (
    <ProcessHeader
      onInspect={result?.url ? openResult : undefined}
      isLoading={isComputing}
      label={
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <MathFunction className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="block min-w-0 max-w-full truncate">{query}</span>
        </div>
      }
      meta={
        result ? (
          <>
            <Check size={16} className="text-green-500" />
            <span>{result.pods.length || 1} result</span>
          </>
        ) : error ? (
          <>
            <AlertCircle size={16} className="text-destructive" />
            <span>{error}</span>
          </>
        ) : (
          <span className="animate-pulse">Computing...</span>
        )
      }
      className={cn(result?.url && 'hover:text-foreground cursor-pointer')}
    />
  )

  return (
    <div className="relative">
      {borderless && (
        <>
          {!isFirst && (
            <div className="absolute left-[19.5px] top-0 h-2 w-px bg-border" />
          )}
          {!isLast && (
            <div className="absolute bottom-0 left-[19.5px] h-2 w-px bg-border" />
          )}
        </>
      )}
      <div
        className={cn(
          'rounded-lg',
          !borderless && 'border border-border bg-card'
        )}
      >
        <div className="flex items-center gap-2 p-3">
          <div className="min-w-0 flex-1">{header}</div>
          {result?.url && (
            <button
              type="button"
              onClick={openResult}
              className="shrink-0 rounded p-1 transition-colors hover:bg-accent"
              aria-label="Open Wolfram|Alpha result"
            >
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        {result?.answer && (
          <div className="border-t px-3 py-2 text-sm">{result.answer}</div>
        )}
      </div>
    </div>
  )
}
