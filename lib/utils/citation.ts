import type { SearchResultItem, SearchResults } from '@/lib/types'
import type { UIMessage } from '@/lib/types/ai'
import { displayUrlName } from '@/lib/utils/domain'

/**
 * Validate if a string is a valid URL
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

export function isCitationLabel(label: string): boolean {
  return /^[\w-]+(?:\.[\w-]+)*$/.test(label)
}

/**
 * Strip provider/router prefixes that some models incorrectly prepend when
 * citing a tool call id. Exact matches are still preferred before this fallback.
 */
function stripToolCallPrefix(toolCallId: string): string {
  return toolCallId.replace(/^(toolu_|call_|search-)/, '')
}

function resolveCitationMap(
  toolCallId: string,
  citationMaps: Record<string, Record<number, SearchResultItem>>
): Record<number, SearchResultItem> | undefined {
  const exactMatch = citationMaps[toolCallId]
  if (exactMatch) return exactMatch

  const normalizedId = stripToolCallPrefix(toolCallId)
  const normalizedKey = Object.keys(citationMaps).find(
    key => stripToolCallPrefix(key) === normalizedId
  )

  return normalizedKey ? citationMaps[normalizedKey] : undefined
}

function citationMapFromResults(
  searchResults: SearchResults
): Record<number, SearchResultItem> | undefined {
  if (searchResults.citationMap) return searchResults.citationMap
  if (!Array.isArray(searchResults.results)) return undefined

  return searchResults.results.reduce<Record<number, SearchResultItem>>(
    (citationMap, result, index) => {
      citationMap[index + 1] = result
      return citationMap
    },
    {}
  )
}

/**
 * Extract citation maps from a message's tool parts
 * Returns a map of toolCallId to citation map
 */
export function extractCitationMaps(
  message: UIMessage
): Record<string, Record<number, SearchResultItem>> {
  const citationMaps: Record<string, Record<number, SearchResultItem>> = {}

  if (!message.parts) return citationMaps

  message.parts.forEach((part: any) => {
    // Check for search tool output
    if (
      part.type === 'tool-search' &&
      part.state === 'output-available' &&
      part.output &&
      part.toolCallId
    ) {
      const searchResults = part.output as SearchResults
      const citationMap = citationMapFromResults(searchResults)
      if (citationMap) {
        // Store citation map with toolCallId as key
        citationMaps[part.toolCallId] = citationMap
      }
    }
  })

  return citationMaps
}

/**
 * Extract citation maps from multiple messages
 * Returns a combined map of toolCallId to citation map
 */
export function extractCitationMapsFromMessages(
  messages: UIMessage[]
): Record<string, Record<number, SearchResultItem>> {
  const combinedCitationMaps: Record<
    string,
    Record<number, SearchResultItem>
  > = {}

  messages.forEach(message => {
    const messageCitationMaps = extractCitationMaps(message)
    // Merge citation maps from this message
    Object.assign(combinedCitationMaps, messageCitationMaps)
  })

  return combinedCitationMaps
}

/**
 * Process citations in content, replacing [number](#toolCallId) with [domain](url)
 * Display text uses domain name instead of number (e.g., [google](url))
 */
export function processCitations(
  content: string,
  citationMaps: Record<string, Record<number, SearchResultItem>>
): string {
  if (!citationMaps || !content || Object.keys(citationMaps).length === 0) {
    return content || ''
  }

  // Replace [number](#toolCallId) or [number](#toolCallId] with [domain](actual-url)
  // Also handle cases with spaces: [ number ]
  return content.replace(
    /\[\s*(\d+)\s*\]\(#([^\)\]]+)[\)\]]/g,
    (_match, num, toolCallId) => {
      const citationNum = parseInt(num, 10)

      // Validate citation number bounds
      if (isNaN(citationNum) || citationNum < 1 || citationNum > 100) {
        return '' // Return empty string for invalid citation numbers
      }

      // Prefer exact toolCallId matches, then fall back to prefix-normalized ids
      // for models that cite toolu_<id>, call_<id>, or search-<id>.
      const citationMap = resolveCitationMap(toolCallId, citationMaps)
      if (!citationMap) {
        return '' // Return empty string if no citation map found
      }

      const citation = citationMap[citationNum]
      if (!citation || !isValidUrl(citation.url)) {
        return '' // Return empty string for invalid citations
      }

      // Extract domain name from URL (removes TLD and subdomain)
      const domainName = displayUrlName(citation.url)

      // Encode URI to prevent injection attacks
      return `[${domainName}](${encodeURI(citation.url)})`
    }
  )
}
