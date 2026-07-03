import { createHash } from 'node:crypto'

import { JSDOM, VirtualConsole } from 'jsdom'

import { SearXNGResult } from '@/lib/types'
import { readResponseWithLimit, safeFetch } from '@/lib/utils/ssrf-guard'

export type SearchDepth = 'basic' | 'advanced'

export type AdvancedSearchRequestBody = {
  query?: unknown
  maxResults?: unknown
  searchDepth?: unknown
  includeDomains?: unknown
  excludeDomains?: unknown
}

export type ParsedAdvancedSearchRequest = {
  query: string
  maxResults: number
  searchDepth: SearchDepth
  includeDomains: string[]
  excludeDomains: string[]
}

export type AdvancedSearchCrawlOptions = {
  timeoutMs: number
  maxRedirects: number
  maxResponseBytes: number
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

export function parseSearchDepth(
  value: unknown,
  defaultDepth: unknown = process.env.SEARXNG_DEFAULT_DEPTH
): SearchDepth {
  if (value === 'advanced' || value === 'basic') return value
  return defaultDepth === 'advanced' ? 'advanced' : 'basic'
}

export function parseMaxResults(value: unknown, maxAllowed: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 10
  return Math.min(Math.max(parsed, 1), maxAllowed)
}

export function parseAdvancedSearchRequest(
  body: AdvancedSearchRequestBody,
  maxAllowedResults: number
): ParsedAdvancedSearchRequest | null {
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  if (!query) return null

  return {
    query,
    maxResults: parseMaxResults(body.maxResults, maxAllowedResults),
    searchDepth: parseSearchDepth(body.searchDepth),
    includeDomains: toStringArray(body.includeDomains),
    excludeDomains: toStringArray(body.excludeDomains)
  }
}

export function buildAdvancedSearchCacheKey(params: {
  query: string
  maxResults: number
  searchDepth: string
  includeDomains: string[]
  excludeDomains: string[]
}): string {
  const normalized = {
    query: params.query,
    maxResults: params.maxResults,
    searchDepth: params.searchDepth,
    includeDomains: [...params.includeDomains].sort(),
    excludeDomains: [...params.excludeDomains].sort()
  }
  const digest = createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
  return `search:${digest}`
}

export function domainMatchesFilter(
  resultUrl: string,
  includeDomains: string[] = [],
  excludeDomains: string[] = []
): boolean {
  try {
    const domain = new URL(resultUrl).hostname
    return (
      (includeDomains.length === 0 ||
        includeDomains.some(includeDomain => domain.includes(includeDomain))) &&
      (excludeDomains.length === 0 ||
        !excludeDomains.some(excludeDomain => domain.includes(excludeDomain)))
    )
  } catch {
    return false
  }
}

export function highlightQueryTerms(content: string, query: string): string {
  try {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 2)
      .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

    let highlightedContent = content

    terms.forEach(term => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi')
      highlightedContent = highlightedContent.replace(
        regex,
        match => `<mark>${match}</mark>`
      )
    })

    return highlightedContent
  } catch {
    return content
  }
}

export function calculateRelevanceScore(
  result: Pick<SearXNGResult, 'content' | 'publishedDate' | 'title'>,
  query: string,
  now: Date = new Date()
): number {
  try {
    const lowercaseContent = result.content.toLowerCase()
    const lowercaseQuery = query.toLowerCase()
    const queryWords = lowercaseQuery
      .split(/\s+/)
      .filter(word => word.length > 2)
      .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

    let score = 0

    if (lowercaseContent.includes(lowercaseQuery)) {
      score += 30
    }

    queryWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'g')
      const wordCount = (lowercaseContent.match(regex) || []).length
      score += wordCount * 3
    })

    const lowercaseTitle = result.title.toLowerCase()
    if (lowercaseTitle.includes(lowercaseQuery)) {
      score += 20
    }

    queryWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'g')
      if (lowercaseTitle.match(regex)) {
        score += 10
      }
    })

    if (result.publishedDate) {
      const publishDate = new Date(result.publishedDate)
      const daysSincePublished =
        (now.getTime() - publishDate.getTime()) / (1000 * 3600 * 24)
      if (daysSincePublished < 30) {
        score += 15
      } else if (daysSincePublished < 90) {
        score += 10
      } else if (daysSincePublished < 365) {
        score += 5
      }
    }

    if (result.content.length < 200) {
      score -= 10
    } else if (result.content.length > 1000) {
      score += 5
    }

    const highlightCount = (result.content.match(/<mark>/g) || []).length
    score += highlightCount * 2

    return score
  } catch {
    return 0
  }
}

export function extractPublicationDate(document: Document): Date | null {
  const dateSelectors = [
    'meta[name="article:published_time"]',
    'meta[property="article:published_time"]',
    'meta[name="publication-date"]',
    'meta[name="date"]',
    'time[datetime]',
    'time[pubdate]'
  ]

  for (const selector of dateSelectors) {
    const element = document.querySelector(selector)
    if (element) {
      const dateStr =
        element.getAttribute('content') ||
        element.getAttribute('datetime') ||
        element.getAttribute('pubdate')
      if (dateStr) {
        const date = new Date(dateStr)
        if (!isNaN(date.getTime())) {
          return date
        }
      }
    }
  }

  return null
}

export function extractContentFromHtml(
  html: string,
  result: SearXNGResult,
  query: string
): SearXNGResult {
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('error', () => {})
  virtualConsole.on('warn', () => {})

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    virtualConsole
  })
  const document = dom.window.document

  document
    .querySelectorAll('script, style, nav, header, footer')
    .forEach((el: Element) => el.remove())

  const mainContent =
    document.querySelector('main') ||
    document.querySelector('article') ||
    document.querySelector('.content') ||
    document.querySelector('#content') ||
    document.body

  if (!mainContent) return result

  const priorityElements = mainContent.querySelectorAll('h1, h2, h3, p')
  let extractedText = Array.from(priorityElements)
    .map(el => el.textContent?.trim())
    .filter(Boolean)
    .join('\n\n')

  if (extractedText.length < 500) {
    const contentElements = mainContent.querySelectorAll(
      'h4, h5, h6, li, td, th, blockquote, pre, code'
    )
    extractedText +=
      '\n\n' +
      Array.from(contentElements)
        .map(el => el.textContent?.trim())
        .filter(Boolean)
        .join('\n\n')
  }

  const metaDescription =
    document.querySelector('meta[name="description"]')?.getAttribute('content') || ''
  const metaKeywords =
    document.querySelector('meta[name="keywords"]')?.getAttribute('content') || ''
  const ogTitle =
    document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    ''
  const ogDescription =
    document
      .querySelector('meta[property="og:description"]')
      ?.getAttribute('content') || ''

  extractedText = `${result.title}\n\n${ogTitle}\n\n${metaDescription}\n\n${ogDescription}\n\n${metaKeywords}\n\n${extractedText}`
  extractedText = extractedText.substring(0, 10000)

  const publishedDate = extractPublicationDate(document)

  return {
    ...result,
    content: highlightQueryTerms(extractedText, query),
    ...(publishedDate ? { publishedDate: publishedDate.toISOString() } : {})
  }
}

export async function fetchHtmlWithSafety(
  url: string,
  options: AdvancedSearchCrawlOptions
): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs)

  try {
    const response = await safeFetch(url, {
      headers: {
        accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
        'user-agent': 'MorphicAdvancedSearch/1.0'
      },
      maxRedirects: options.maxRedirects,
      maxResponseBytes: options.maxResponseBytes,
      signal: controller.signal
    })
    const contentType = response.headers.get('content-type') || ''
    if (
      contentType &&
      !contentType.includes('text/html') &&
      !contentType.includes('text/plain')
    ) {
      throw new Error(`Unsupported content type: ${contentType}`)
    }
    return await readResponseWithLimit(response, options.maxResponseBytes)
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function crawlPage(
  result: SearXNGResult,
  query: string,
  options: AdvancedSearchCrawlOptions
): Promise<SearXNGResult> {
  try {
    const html = await fetchHtmlWithSafety(result.url, options)
    return extractContentFromHtml(html, result, query)
  } catch (error) {
    console.error(`Error crawling ${result.url}:`, error)
    return {
      ...result,
      content: result.content || 'Content unavailable due to crawling error.'
    }
  }
}

export function isQualityContent(text: string): boolean {
  const words = text.split(/\s+/).length
  const sentences = text.split(/[.!?]+/).length
  const avgWordsPerSentence = words / sentences

  return (
    words > 50 &&
    sentences > 3 &&
    avgWordsPerSentence > 5 &&
    avgWordsPerSentence < 30 &&
    !text.includes('Content unavailable due to crawling error') &&
    !text.includes('Error fetching content:')
  )
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  const workerCount = Math.min(Math.max(concurrency, 1), items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}
