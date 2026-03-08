/**
 * Web search module using DuckDuckGo (no API key required).
 * Provides search + optional page content extraction for the agent pipeline.
 */

import { search, SafeSearchType } from 'duck-duck-scrape'

export interface WebResult {
  title: string
  snippet: string
  url: string
  content?: string
}

/**
 * Search the web via DuckDuckGo. Returns structured results.
 */
export async function searchWeb(
  query: string,
  maxResults: number = 5
): Promise<WebResult[]> {
  const q = query.trim()
  if (!q) return []

  try {
    const response = await search(q, { safeSearch: SafeSearchType.MODERATE })
    if (!response.results || response.results.length === 0) return []

    return response.results.slice(0, maxResults).map((r) => ({
      title: r.title || '',
      snippet: r.description || '',
      url: r.url || '',
    }))
  } catch (err) {
    console.error('Web search error:', err)
    return []
  }
}

/**
 * Fetch a URL and extract its text content (stripped of HTML).
 * Used in deep mode to get full page content for richer context.
 */
export async function fetchPageContent(
  url: string,
  maxChars: number = 8000
): Promise<string> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DocumentAgent/1.0)' },
    })
    clearTimeout(timeout)

    if (!res.ok) return ''
    const html = await res.text()

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()

    return text.slice(0, maxChars)
  } catch {
    return ''
  }
}

/**
 * Run multiple web searches in parallel and deduplicate by URL.
 */
export async function multiWebSearch(
  queries: string[],
  resultsPerQuery: number = 4,
  totalLimit: number = 15
): Promise<WebResult[]> {
  const valid = queries.filter((q) => q.trim())
  const allResults = await Promise.all(
    valid.map((q) => searchWeb(q, resultsPerQuery))
  )

  const seen = new Map<string, WebResult>()
  for (const results of allResults) {
    for (const r of results) {
      if (!seen.has(r.url)) seen.set(r.url, r)
    }
  }
  return Array.from(seen.values()).slice(0, totalLimit)
}

/**
 * Enrich web results by fetching page content for the top N results.
 */
export async function enrichWebResults(
  results: WebResult[],
  topN: number = 3
): Promise<WebResult[]> {
  const toEnrich = results.slice(0, topN)
  const rest = results.slice(topN)

  const enriched = await Promise.all(
    toEnrich.map(async (r) => {
      const content = await fetchPageContent(r.url)
      return { ...r, content: content || undefined }
    })
  )

  return [...enriched, ...rest]
}

/**
 * Format web results into a context string for the LLM prompt.
 */
export function buildWebContext(results: WebResult[]): string {
  if (results.length === 0) return ''
  const parts = results.map((r, i) => {
    let block = `### Source web ${i + 1}: ${r.title}\nURL: ${r.url}\n${r.snippet}`
    if (r.content) {
      block += `\n\nContenu extrait:\n${r.content}`
    }
    return block
  })
  return '\n---\n## RÉSULTATS DE RECHERCHE WEB\n\n' + parts.join('\n\n') + '\n---\n'
}
