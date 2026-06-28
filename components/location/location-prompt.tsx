'use client'

import { useCallback, useEffect, useState } from 'react'

import {
  detectUserRegion,
  formatLocationDisplay,
  getLocationPermissionStatus,
  type LocationPermissionStatus,
  type LocationRegionResult
} from '@/lib/location/location-privacy'
import { cn } from '@/lib/utils'

import { NativeIcon } from '@/components/native/native-icon'

interface LocationPromptProps {
  /** Called when a region is successfully detected */
  onRegionDetected: (regionCode: string, displayName: string) => void
  /** Current manual region for display */
  currentRegion?: string
  className?: string
}

/**
 * Privacy-respecting location prompt.
 *
 * Shows a button to detect the user's region. Explains what data is used
 * and what isn't. Only triggers the browser permission dialog when the
 * user explicitly taps the button.
 */
export function LocationPrompt({
  onRegionDetected,
  currentRegion,
  className
}: LocationPromptProps) {
  const [status, setStatus] = useState<LocationPermissionStatus>('prompt')
  const [detecting, setDetecting] = useState(false)
  const [result, setResult] = useState<LocationRegionResult | null>(null)

  useEffect(() => {
    getLocationPermissionStatus().then(setStatus)
  }, [])

  const handleDetect = useCallback(async () => {
    setDetecting(true)
    const detected = await detectUserRegion()
    setResult(detected)
    setDetecting(false)

    if (detected.regionCode) {
      onRegionDetected(detected.regionCode, formatLocationDisplay(detected))
    }

    // Update permission status after attempt
    getLocationPermissionStatus().then(setStatus)
  }, [onRegionDetected])

  // Already denied — show info
  if (status === 'denied') {
    return (
      <div className={cn('text-xs text-muted-foreground', className)}>
        <p>
          Location access was denied. Using manual region:{' '}
          {currentRegion || 'US'}
        </p>
        <p className="mt-1 opacity-75">
          You can change your region in search settings, or enable location in
          browser settings.
        </p>
      </div>
    )
  }

  // Not available (SSR or no geolocation API)
  if (status === 'unavailable') {
    return null
  }

  // Successfully detected
  if (result?.regionCode) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 text-xs text-muted-foreground',
          className
        )}
      >
        <NativeIcon name="mapPin" size={14} className="text-primary" />
        <span>
          Searching from{' '}
          <span className="font-medium text-foreground">
            {formatLocationDisplay(result)}
          </span>
        </span>
      </div>
    )
  }

  // Prompt state — show the request button
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <button
        type="button"
        onClick={handleDetect}
        disabled={detecting}
        className={cn(
          'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs',
          'text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
          detecting && 'opacity-50 cursor-wait'
        )}
      >
        <NativeIcon name="mapPin" size={14} />
        {detecting
          ? 'Detecting location...'
          : 'Use my location for better results'}
      </button>
      <p className="text-[10px] text-muted-foreground/60 max-w-xs leading-relaxed">
        Only your general area (city/region) is used. Exact coordinates are
        never stored or sent to our servers.
      </p>
    </div>
  )
}
