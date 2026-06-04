'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import {
  IconArrowLeft,
  IconCalculator,
  IconFilter,
  IconKey,
  IconLanguage,
  IconMapPin,
  IconNews,
  IconSpeakerphone,
  IconTrash
} from '@tabler/icons-react'
import { toast } from 'sonner'

import {
  LANGUAGES,
  REGIONS,
  SAFE_SEARCH_OPTIONS
} from '@/lib/config/search-preferences'
import { useSearchPreferences } from '@/lib/hooks/use-search-preferences'

import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select'
import { Separator } from './ui/separator'
import { Switch } from './ui/switch'

type WolframAppIdStatus = {
  hasUserAppId: boolean
  hasEnvironmentAppId: boolean
  maskedUserAppId: string | null
  source: 'user' | 'environment' | 'none'
}

export function SearchSettings() {
  const { preferences, setPreferences } = useSearchPreferences()
  const [wolframAppId, setWolframAppId] = useState('')
  const [wolframStatus, setWolframStatus] =
    useState<WolframAppIdStatus | null>(null)
  const [isWolframSaving, setIsWolframSaving] = useState(false)
  const [isWolframLoading, setIsWolframLoading] = useState(true)

  const update = (key: string, value: string | boolean, label: string) => {
    setPreferences({ [key]: value })
    toast.success(`${label} updated`, { duration: 1500 })
  }

  const loadWolframStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/wolfram-alpha/app-id')
      if (!response.ok) throw new Error('Unable to load Wolfram settings')
      setWolframStatus(await response.json())
    } catch (error) {
      console.error(error)
      toast.error('Could not load Wolfram settings')
    } finally {
      setIsWolframLoading(false)
    }
  }, [])

  useEffect(() => {
    loadWolframStatus()
  }, [loadWolframStatus])

  const saveWolframAppId = async () => {
    const appId = wolframAppId.trim()
    if (!appId) {
      toast.error('Enter a Wolfram|Alpha AppID first')
      return
    }

    setIsWolframSaving(true)
    try {
      const response = await fetch('/api/wolfram-alpha/app-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId })
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload?.error || 'Could not save Wolfram AppID')
      }

      setWolframStatus(payload)
      setWolframAppId('')
      toast.success('Wolfram|Alpha AppID saved')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not save Wolfram AppID'
      )
    } finally {
      setIsWolframSaving(false)
    }
  }

  const removeWolframAppId = async () => {
    setIsWolframSaving(true)
    try {
      const response = await fetch('/api/wolfram-alpha/app-id', {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error('Could not remove Wolfram AppID')

      setWolframStatus(await response.json())
      setWolframAppId('')
      toast.success('Wolfram|Alpha AppID removed')
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not remove Wolfram AppID'
      )
    } finally {
      setIsWolframSaving(false)
    }
  }

  const wolframStatusText = isWolframLoading
    ? 'Checking configuration...'
    : wolframStatus?.source === 'user'
      ? `Using your AppID ${wolframStatus.maskedUserAppId}`
      : wolframStatus?.source === 'environment'
        ? 'Using the server configured AppID'
        : 'No AppID configured'

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-16">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Search Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Customize how search results are filtered and displayed across all
            providers.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {/* ── Language ───────────────────────────────────────────────── */}
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <div className="mt-0.5 rounded-lg bg-primary/10 p-2">
                  <IconLanguage className="size-5 text-primary" />
                </div>
                <div>
                  <Label className="text-sm font-semibold">
                    Interface Language
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Preferred language for search results and interface text
                  </p>
                </div>
              </div>
              <Select
                value={preferences.language}
                onValueChange={v => update('language', v, 'Language')}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(l => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Region ────────────────────────────────────────────────── */}
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <div className="mt-0.5 rounded-lg bg-primary/10 p-2">
                  <IconMapPin className="size-5 text-primary" />
                </div>
                <div>
                  <Label className="text-sm font-semibold">Region</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Country to bias local results, news, and currency
                  </p>
                </div>
              </div>
              <Select
                value={preferences.region}
                onValueChange={v => update('region', v, 'Region')}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.map(r => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Safe Search ───────────────────────────────────────────── */}
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <div className="mt-0.5 rounded-lg bg-primary/10 p-2">
                  <IconFilter className="size-5 text-primary" />
                </div>
                <div>
                  <Label className="text-sm font-semibold">
                    Filter Adult Content
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Control how explicit content is filtered in results
                  </p>
                </div>
              </div>
              <Select
                value={preferences.safeSearch}
                onValueChange={v =>
                  update(
                    'safeSearch',
                    v as 'off' | 'moderate' | 'strict',
                    'Safe search'
                  )
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SAFE_SEARCH_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      <div className="flex flex-col">
                        <span>{o.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Wolfram|Alpha ────────────────────────────────────────── */}
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="mt-0.5 rounded-lg bg-primary/10 p-2">
                    <IconCalculator className="size-5 text-primary" />
                  </div>
                  <div>
                    <Label
                      htmlFor="wolfram-app-id"
                      className="text-sm font-semibold"
                    >
                      Wolfram|Alpha AppID
                    </Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Use your own AppID for computational answers
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {wolframStatusText}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="wolfram-app-id"
                  type="password"
                  value={wolframAppId}
                  onChange={event => setWolframAppId(event.target.value)}
                  placeholder="Enter AppID"
                  autoComplete="new-password"
                  spellCheck={false}
                  className="font-mono"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={saveWolframAppId}
                    disabled={isWolframSaving || !wolframAppId.trim()}
                    className="gap-2"
                  >
                    <IconKey className="size-4" />
                    Save
                  </Button>
                  {wolframStatus?.hasUserAppId ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={removeWolframAppId}
                      disabled={isWolframSaving}
                      aria-label="Remove Wolfram AppID"
                    >
                      <IconTrash className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* ── News on Homepage ──────────────────────────────────────── */}
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="flex gap-3">
                <div className="mt-0.5 rounded-lg bg-primary/10 p-2">
                  <IconNews className="size-5 text-primary" />
                </div>
                <div>
                  <Label htmlFor="show-news" className="text-sm font-semibold">
                    News on Homepage
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Show trending news stories on the homepage
                  </p>
                </div>
              </div>
              <Switch
                id="show-news"
                checked={preferences.showNews}
                onCheckedChange={v => update('showNews', v, 'News')}
              />
            </div>
          </div>

          {/* ── Ads / Sponsored ───────────────────────────────────────── */}
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="flex gap-3">
                <div className="mt-0.5 rounded-lg bg-primary/10 p-2">
                  <IconSpeakerphone className="size-5 text-primary" />
                </div>
                <div>
                  <Label htmlFor="show-ads" className="text-sm font-semibold">
                    Ads / Sponsored Content
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Allow sponsored content to appear on the homepage
                  </p>
                </div>
              </div>
              <Switch
                id="show-ads"
                checked={preferences.showAds}
                onCheckedChange={v => update('showAds', v, 'Ads preference')}
              />
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <Button asChild variant="outline" className="gap-2">
            <Link href="/">
              <IconArrowLeft className="size-4" />
              Return to search
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
