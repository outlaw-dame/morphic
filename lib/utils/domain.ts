/**
 * Extract display name from URL by removing TLD and www/subdomain
 * This is a pure client-safe utility function without Next.js dependencies
 * @param url - Full URL string
 * @returns Domain name without TLD (e.g., "google" from "www.google.com")
 * @example
 * displayUrlName("https://www.google.com") // "google"
 * displayUrlName("https://docs.github.com") // "github"
 * displayUrlName("https://news.example.com.au") // "example"
 */
const COMMON_COMPOUND_TLD_PREFIXES = new Set([
  'ac',
  'co',
  'com',
  'edu',
  'gov',
  'net',
  'org'
])

function stripLeadingWww(labels: string[]): string[] {
  return labels[0] === 'www' ? labels.slice(1) : labels
}

function getRegistrableLabels(hostname: string): string[] {
  const labels = stripLeadingWww(hostname.toLowerCase().split('.').filter(Boolean))

  if (labels.length <= 1) return labels

  const last = labels.at(-1) ?? ''
  const secondLast = labels.at(-2) ?? ''
  const hasCompoundTld =
    labels.length >= 3 &&
    last.length === 2 &&
    COMMON_COMPOUND_TLD_PREFIXES.has(secondLast)

  if (hasCompoundTld) {
    return labels.slice(0, -2)
  }

  return labels.slice(0, -1)
}

export const displayUrlName = (url: string): string => {
  try {
    const hostname = new URL(url).hostname
    const labels = getRegistrableLabels(hostname)

    if (labels.length === 0) return 'source'
    if (labels.length === 1) return labels[0]

    return labels.slice(1).join('.')
  } catch {
    // Fallback for invalid URLs
    return 'source'
  }
}
