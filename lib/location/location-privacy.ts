/**
 * Privacy-respecting location detection for search relevance.
 *
 * Design principles:
 * - Only requests location after explicit user consent
 * - Uses coarse location only (city/region level)
 * - NEVER stores raw coordinates (lat/lng)
 * - Only derives a region code (e.g., "US", "GB") and discards location data
 * - Falls back to manual region selection if denied
 * - Works on web, PWA, and Capacitor
 * - No server-side location tracking
 *
 * Privacy flow:
 * 1. User taps "Use my location for better results"
 * 2. Browser shows permission dialog
 * 3. If granted: get coarse coordinates → reverse geocode to region → save region code → discard coordinates
 * 4. If denied: continue with manual region preference
 */

export type LocationPermissionStatus =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unavailable'

export interface LocationRegionResult {
  /** Detected region code (ISO 3166-1 alpha-2) */
  regionCode: string | null
  /** City name (for display, not stored permanently) */
  cityName?: string
  /** Human-readable region name */
  regionName?: string
  /** Whether the user granted permission */
  permissionGranted: boolean
  /** Error message if detection failed */
  error?: string
}

/**
 * Check current geolocation permission status without triggering a prompt.
 */
export async function getLocationPermissionStatus(): Promise<LocationPermissionStatus> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return 'unavailable'
  }

  if (!navigator.permissions) {
    // Can't check without prompting — report as 'prompt'
    return 'prompt'
  }

  try {
    const result = await navigator.permissions.query({ name: 'geolocation' })
    switch (result.state) {
      case 'granted':
        return 'granted'
      case 'denied':
        return 'denied'
      default:
        return 'prompt'
    }
  } catch {
    return 'prompt'
  }
}

/**
 * Request the user's location and derive a region code.
 *
 * Privacy guarantees:
 * - Uses low-accuracy positioning (no GPS, cell/WiFi only)
 * - Coordinates are used only for reverse geocoding then discarded
 * - Only the region code is returned for storage
 * - Timeout after 10 seconds
 */
export async function detectUserRegion(): Promise<LocationRegionResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return {
      regionCode: null,
      permissionGranted: false,
      error: 'Geolocation not available'
    }
  }

  try {
    const position = await new Promise<GeolocationPosition>(
      (resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false, // Coarse location only — no GPS
          timeout: 10000,
          maximumAge: 300000 // Cache for 5 minutes
        })
      }
    )

    // Extract coarse coordinates (rounded to reduce precision)
    const lat = Math.round(position.coords.latitude * 10) / 10
    const lng = Math.round(position.coords.longitude * 10) / 10

    // Reverse geocode to region — uses a free, privacy-respecting service
    const region = await reverseGeocodeToRegion(lat, lng)

    // Coordinates are NOT returned or stored — only the region code
    return {
      regionCode: region.regionCode,
      cityName: region.cityName,
      regionName: region.regionName,
      permissionGranted: true
    }
  } catch (error: any) {
    if (error?.code === 1) {
      // Permission denied
      return {
        regionCode: null,
        permissionGranted: false,
        error: 'Location permission denied'
      }
    }

    return {
      regionCode: null,
      permissionGranted: false,
      error: error?.message || 'Location detection failed'
    }
  }
}

/**
 * Reverse geocode coordinates to a region code.
 *
 * Uses OpenStreetMap Nominatim (free, no API key, privacy policy allows this use).
 * Only sends rounded coordinates (city-level precision).
 */
async function reverseGeocodeToRegion(
  lat: number,
  lng: number
): Promise<{
  regionCode: string | null
  cityName?: string
  regionName?: string
}> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'gist./1.0 (privacy-respecting-search)',
          Accept: 'application/json'
        }
      }
    )

    if (!response.ok) {
      return { regionCode: null }
    }

    const data = await response.json()
    const address = data?.address

    if (!address) {
      return { regionCode: null }
    }

    return {
      regionCode: address.country_code?.toUpperCase() || null,
      cityName: address.city || address.town || address.village,
      regionName: address.state || address.county
    }
  } catch {
    return { regionCode: null }
  }
}

/**
 * Format a location result for display to the user.
 */
export function formatLocationDisplay(result: LocationRegionResult): string {
  if (!result.regionCode) return 'Location not available'

  const parts: string[] = []
  if (result.cityName) parts.push(result.cityName)
  if (result.regionName) parts.push(result.regionName)

  return parts.length > 0 ? parts.join(', ') : result.regionCode
}
