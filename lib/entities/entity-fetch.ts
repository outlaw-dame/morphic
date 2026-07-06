const ENTITY_LOOKUP_TIMEOUT_MS = 2500

const USER_AGENT =
  process.env.KNOWLEDGE_GRAPH_USER_AGENT ||
  'Morphic/1.0 (source-first search entity enrichment)'

export async function fetchEntityJson(
  url: string,
  headers: HeadersInit = {}
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        ...headers
      },
      signal: AbortSignal.timeout(ENTITY_LOOKUP_TIMEOUT_MS)
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}
