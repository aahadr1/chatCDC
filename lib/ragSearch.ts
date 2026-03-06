/**
 * CDC Agent: full-text search over cdc_chunks and context building for the LLM.
 */

import { supabase } from './supabaseClient'

export interface SearchChunk {
  id: string
  document_id: string
  document_name: string
  content: string
  chunk_index: number
  rank: number
}

/**
 * Run a single full-text query against cdc_chunks (French FTS).
 */
export async function searchChunks(
  query: string,
  limit: number = 8
): Promise<SearchChunk[]> {
  const { data, error } = await supabase.rpc('search_cdc_chunks', {
    query: query.trim(),
    match_count: limit,
  })
  if (error) {
    console.error('search_cdc_chunks error:', error)
    return []
  }
  return (data || []) as SearchChunk[]
}

/**
 * Run multiple queries and merge results, deduplicating by chunk id (keep highest rank).
 */
export async function multiQuerySearch(
  queries: string[],
  limitPerQuery: number = 12,
  totalLimit: number = 50
): Promise<SearchChunk[]> {
  const seen = new Map<string, SearchChunk>()
  for (const q of queries) {
    if (!q.trim()) continue
    const results = await searchChunks(q.trim(), limitPerQuery)
    for (const row of results) {
      const existing = seen.get(row.id)
      if (!existing || row.rank > existing.rank) {
        seen.set(row.id, row)
      }
    }
  }
  return Array.from(seen.values())
    .sort((a, b) => b.rank - a.rank)
    .slice(0, totalLimit)
}

/**
 * Format retrieved chunks into a single context string for the LLM prompt.
 */
export function buildContext(chunks: SearchChunk[]): string {
  if (chunks.length === 0) return ''
  const parts = chunks.map((c, i) => {
    return `### Extrait ${i + 1} (source: ${c.document_name})\n${c.content}`
  })
  return '\n---\n## EXTRAITS DE DOCUMENTS (base de connaissances CDC)\n\n' + parts.join('\n\n') + '\n---\n'
}
