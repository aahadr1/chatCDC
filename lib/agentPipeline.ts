/**
 * CDC Agent: orchestrates quick vs deep mode, search, outline, and section-by-section generation.
 * Yields SSE-shaped events for the API route to stream.
 */

import { streamGPT5, type ChatMessage } from './replicate'
import { multiQuerySearch, searchChunks, buildContext, getChunkCount, getRecentChunks, type SearchChunk } from './ragSearch'

export type SSEEvent =
  | { type: 'status'; phase: 'search' | 'plan' | 'generate'; message?: string; section?: number; total?: number; title?: string }
  | { type: 'outline'; sections: { title: string; description?: string; search_queries?: string[] }[] }
  | { type: 'content'; text: string }
  | { type: 'sources'; chunks: { doc: string; excerpt: string }[] }
  | { type: 'done' }
  | { type: 'error'; message: string }

const QUICK_SYSTEM =
  'Tu es l\'Agent CDC, un assistant expert sur la Caisse des Dépôts et Consignations. Réponds aux questions en te basant UNIQUEMENT sur les extraits de documents fournis. Réponds toujours en français. Cite le nom du document source quand c\'est possible. Si l\'information n\'est pas dans les documents, dis-le honnêtement.'

const CLASSIFY_SYSTEM =
  'Tu dois classifier la demande utilisateur. Réponds par exactement un seul mot: "quick" si c\'est une question courte (fait, chiffre, définition), ou "deep" si l\'utilisateur demande un rapport, une analyse longue, une synthèse multi-documents, ou un document de plus d\'une page. Réponds uniquement: quick ou deep.'

const EXPAND_QUERIES_SYSTEM =
  'À partir de la question ou demande de l\'utilisateur, génère 4 à 6 requêtes de recherche courtes en français pour trouver les passages pertinents dans une base de documents sur la Caisse des Dépôts. Une requête par ligne, pas de numérotation.'

const OUTLINE_SYSTEM =
  'À partir de la demande de l\'utilisateur et des extraits de documents fournis, génère un plan structuré détaillé (titres de sections) pour un document complet. Chaque section doit couvrir un aspect précis. Réponds en JSON valide uniquement, avec ce format: {"sections":[{"title":"...","description":"...","search_queries":["..."]}]}. Pas de texte avant ou après le JSON.'

const SECTION_SYSTEM_PREFIX =
  'Tu rédiges la section "{{title}}" d\'un rapport sur la Caisse des Dépôts. Base-toi UNIQUEMENT sur les extraits fournis. Sois exhaustif, détaillé et professionnel. Cite tes sources (nom du document). Écris au moins {{min_chars}} caractères pour cette section. Réponds en français.'

async function completePrompt(
  messages: ChatMessage[],
  systemPrompt: string,
  maxTokens: number = 1024
): Promise<string> {
  let full = ''
  for await (const chunk of streamGPT5(messages, {
    system_prompt: systemPrompt,
    max_completion_tokens: maxTokens,
    verbosity: 'low',
    reasoning_effort: 'minimal',
  })) {
    full += chunk
  }
  return full.trim()
}

function parseOutlineJson(raw: string): { title: string; description?: string; search_queries?: string[] }[] {
  const cleaned = raw.replace(/^[\s\S]*?\{/, '{').replace(/\}[\s\S]*$/, '}')
  try {
    const parsed = JSON.parse(cleaned) as { sections?: { title: string; description?: string; search_queries?: string[] }[] }
    return Array.isArray(parsed.sections) ? parsed.sections : []
  } catch {
    return []
  }
}

/**
 * Expand user message into 3–5 search queries (one short LLM call).
 */
async function expandToSearchQueries(userMessage: string): Promise<string[]> {
  const out = await completePrompt(
    [{ role: 'user', content: userMessage }],
    EXPAND_QUERIES_SYSTEM,
    300
  )
  const lines = out
    .split(/\n/)
    .map((l) => l.replace(/^[\d.)\-\*]+\s*/, '').trim())
    .filter((l) => l.length > 3)
  return lines.slice(0, 6)
}

/**
 * Classify request as quick (short answer) or deep (long report).
 */
async function classifyRequest(userMessage: string): Promise<'quick' | 'deep'> {
  const out = await completePrompt(
    [{ role: 'user', content: userMessage }],
    CLASSIFY_SYSTEM,
    20
  )
  return out.toLowerCase().includes('deep') ? 'deep' : 'quick'
}

export interface PipelineOptions {
  forceDeep?: boolean
}

/**
 * Main pipeline: yields SSE events (status, outline, content, sources, done).
 */
export async function* runPipeline(
  userMessage: string,
  options: PipelineOptions = {}
): AsyncGenerator<SSEEvent, void, unknown> {
  const forceDeep = options.forceDeep === true

  try {
    const mode = forceDeep ? 'deep' : await classifyRequest(userMessage)

    if (mode === 'quick') {
      yield { type: 'status', phase: 'search', message: 'Recherche dans les documents...' }
      let chunks = await searchChunks(userMessage, 12)
      if (chunks.length === 0) {
        const totalChunks = await getChunkCount()
        if (totalChunks === 0) {
          const emptyMessage =
            "**Aucun document dans la base.**\n\nPour que je puisse répondre à partir de vos PDF ou documents, il faut d’abord les ajouter à la **Base de documents** (panneau de gauche sur cette page). Cliquez sur « Ajouter un document » et choisissez vos fichiers PDF, DOCX ou TXT. Les documents joints dans le chat principal ne sont pas utilisés ici : seuls les fichiers ajoutés dans ce panneau sont indexés."
          yield { type: 'content', text: emptyMessage }
          yield { type: 'done' }
          return
        }
        chunks = await getRecentChunks(12)
        yield { type: 'status', phase: 'plan', message: 'Aucune correspondance exacte ; utilisation d’extraits généraux de la base.' }
      } else {
        yield { type: 'sources', chunks: chunks.slice(0, 8).map((c) => ({ doc: c.document_name, excerpt: c.content.slice(0, 200) + '...' })) }
      }
      const context = buildContext(chunks)
      const messages: ChatMessage[] = [
        { role: 'user', content: `${context}\n\n---\n\nQuestion ou demande de l'utilisateur:\n\n${userMessage}` },
      ]
      for await (const token of streamGPT5(messages, {
        system_prompt: QUICK_SYSTEM,
        max_completion_tokens: 4096,
        verbosity: 'medium',
        reasoning_effort: 'medium',
      })) {
        yield { type: 'content', text: token }
      }
      yield { type: 'done' }
      return
    }

    // Deep mode
    yield { type: 'status', phase: 'search', message: 'Recherche dans la base de documents...' }
    const queries = await expandToSearchQueries(userMessage)
    const allChunks = await multiQuerySearch(queries, 12, 50)
    yield {
      type: 'status',
      phase: 'search',
      message: `${allChunks.length} section(s) pertinente(s) trouvée(s).`,
    }

    yield { type: 'status', phase: 'plan', message: 'Élaboration du plan...' }
    const contextForOutline = buildContext(allChunks.slice(0, 30))
    const outlineRaw = await completePrompt(
      [
        {
          role: 'user',
          content: `${contextForOutline}\n\n---\n\nDemande de l'utilisateur:\n\n${userMessage}`,
        },
      ],
      OUTLINE_SYSTEM,
      2048
    )
    const sections = parseOutlineJson(outlineRaw)
    if (sections.length === 0) {
      sections.push({ title: 'Réponse', description: 'Contenu principal', search_queries: [userMessage] })
    }
    yield { type: 'outline', sections }

    const total = sections.length
    const minCharsPerSection = 2000

    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i]
      yield {
        type: 'status',
        phase: 'generate',
        section: i + 1,
        total,
        title: sec.title,
      }
      const sectionQueries = sec.search_queries && sec.search_queries.length > 0
        ? sec.search_queries
        : [sec.title, userMessage]
      const sectionChunks = await multiQuerySearch(sectionQueries, 8, 20)
      const sectionContext = buildContext(sectionChunks)
      const systemSection = SECTION_SYSTEM_PREFIX.replace('{{title}}', sec.title).replace(
        '{{min_chars}}',
        String(minCharsPerSection)
      )
      const sectionMessages: ChatMessage[] = [
        {
          role: 'user',
          content: `${sectionContext}\n\n---\n\nRédige la section "${sec.title}" du rapport. Contexte global de la demande: ${userMessage}`,
        },
      ]
      for await (const token of streamGPT5(sectionMessages, {
        system_prompt: systemSection,
        max_completion_tokens: 8000,
        verbosity: 'high',
        reasoning_effort: 'medium',
      })) {
        yield { type: 'content', text: token }
      }
      yield { type: 'content', text: '\n\n' }
    }

    yield {
      type: 'sources',
      chunks: allChunks.slice(0, 15).map((c) => ({ doc: c.document_name, excerpt: c.content.slice(0, 150) + '...' })),
    }
    yield { type: 'done' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Une erreur est survenue.'
    yield { type: 'error', message }
    yield { type: 'done' }
  }
}
