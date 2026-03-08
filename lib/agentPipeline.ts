/**
 * Document agent pipeline: orchestrates quick vs deep mode with document RAG,
 * optional web search, file attachments, and section-by-section report generation.
 */

import { streamLLM, type ChatMessage } from './replicate'
import {
  multiQuerySearch,
  searchChunks,
  buildContext,
  getChunkCount,
  getRecentChunks,
  type SearchChunk,
} from './ragSearch'
import {
  searchWeb,
  multiWebSearch,
  enrichWebResults,
  buildWebContext,
  type WebResult,
} from './webSearch'

// ---------------------------------------------------------------------------
// SSE event types
// ---------------------------------------------------------------------------

export type SSEEvent =
  | {
      type: 'status'
      phase: 'search' | 'web' | 'plan' | 'generate'
      message?: string
      section?: number
      total?: number
      title?: string
    }
  | {
      type: 'outline'
      sections: { title: string; description?: string; search_queries?: string[]; web_queries?: string[] }[]
    }
  | { type: 'web_results'; results: { title: string; url: string }[] }
  | { type: 'content'; text: string }
  | { type: 'sources'; chunks: { doc: string; excerpt: string }[]; webUrls?: { title: string; url: string }[] }
  | { type: 'done' }
  | { type: 'error'; message: string }

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const QUICK_SYSTEM = `Tu es un assistant documentaire expert. Réponds aux questions en te basant sur les extraits de documents fournis et, si disponible, sur les résultats de recherche web. Réponds toujours en français.
Règles :
- Cite le nom du document source ou l'URL web entre parenthèses quand c'est possible.
- Structure ta réponse avec des titres markdown si la réponse est longue.
- Si l'information n'est pas dans les sources, dis-le honnêtement.
- Sois précis, complet et professionnel.`

const EXPAND_QUERIES_SYSTEM = `À partir de la demande de l'utilisateur, génère 8 à 10 requêtes de recherche courtes et variées en français pour trouver les passages pertinents dans une base de documents et sur le web. Couvre différents angles et synonymes. Une requête par ligne, pas de numérotation.`

const OUTLINE_SYSTEM = `Tu es un expert en rédaction de documents professionnels. À partir de la demande de l'utilisateur et des extraits fournis, génère un plan EXHAUSTIF et détaillé pour un document complet de haute qualité.

Le plan doit inclure :
- Une section "Introduction" en premier
- Des sections de contenu couvrant chaque aspect de la demande (au moins 4-8 sections)
- Une section "Conclusion" en dernier

Pour chaque section, fournis des requêtes de recherche spécifiques pour trouver le contenu pertinent.

Réponds UNIQUEMENT en JSON valide :
{"sections":[{"title":"...","description":"Description détaillée de ce que cette section doit couvrir","search_queries":["requête docs 1","requête docs 2"],"web_queries":["requête web 1"]}]}

Pas de texte avant ou après le JSON.`

function buildSectionSystem(title: string, minChars: number): string {
  return `Tu rédiges la section "${title}" d'un rapport professionnel.
Règles impératives :
- Base-toi sur les extraits de documents et résultats web fournis.
- Rédige de façon FINALE et PROFESSIONNELLE, comme un document prêt à être livré.
- Écris au moins ${minChars} caractères pour cette section.
- Utilise des paragraphes bien structurés, pas de listes à puces sauf si vraiment pertinent.
- Cite tes sources entre parenthèses (nom du document ou URL).
- Ne fais PAS de méta-commentaire sur la rédaction.
- Réponds en français.`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function completePrompt(
  messages: ChatMessage[],
  systemPrompt: string,
  maxTokens: number = 2048
): Promise<string> {
  let full = ''
  for await (const chunk of streamLLM(messages, {
    system_prompt: systemPrompt,
    max_completion_tokens: maxTokens,
    model_tier: 'fast',
    verbosity: 'low',
    reasoning_effort: 'minimal',
  })) {
    full += chunk
  }
  return full.trim()
}

function parseOutlineJson(
  raw: string
): { title: string; description?: string; search_queries?: string[]; web_queries?: string[] }[] {
  const cleaned = raw.replace(/^[\s\S]*?\{/, '{').replace(/\}[\s\S]*$/, '}')
  try {
    const parsed = JSON.parse(cleaned) as {
      sections?: { title: string; description?: string; search_queries?: string[]; web_queries?: string[] }[]
    }
    return Array.isArray(parsed.sections) ? parsed.sections : []
  } catch {
    return []
  }
}

async function expandToSearchQueries(userMessage: string): Promise<string[]> {
  const out = await completePrompt(
    [{ role: 'user', content: userMessage }],
    EXPAND_QUERIES_SYSTEM,
    500
  )
  return out
    .split(/\n/)
    .map((l) => l.replace(/^[\d.)\-\*]+\s*/, '').trim())
    .filter((l) => l.length > 3)
    .slice(0, 10)
}

// ---------------------------------------------------------------------------
// Keyword-based quick classification (no LLM call)
// ---------------------------------------------------------------------------

const DEEP_KEYWORDS = [
  'rapport', 'analyse détaillée', 'analyse detaillee', 'synthèse', 'synthese',
  'compare', 'comparer', 'document complet', 'résume tout', 'resume tout',
  'multi-documents', 'exhaustif', 'rédige un', 'redige un', 'note de synthèse',
  'note de synthese', 'récapitulatif', 'recapitulatif', 'dossier complet',
  'présentation complète', 'presentation complete', 'état des lieux',
  'etat des lieux', 'bilan complet', 'étude complète', 'etude complete',
  'analyse approfondie', 'rapport complet', 'fais-moi un rapport',
  'fais moi un rapport', 'rédige moi', 'redige moi', 'rédaction',
  'redaction', 'mémoire', 'memoire', 'dossier', 'livrable',
]

function classifyRequestFast(userMessage: string): 'quick' | 'deep' {
  const lower = userMessage.toLowerCase()
  return DEEP_KEYWORDS.some((kw) => lower.includes(kw)) ? 'deep' : 'quick'
}

// ---------------------------------------------------------------------------
// Pipeline options
// ---------------------------------------------------------------------------

export interface PipelineOptions {
  forceDeep?: boolean
  enableWebSearch?: boolean
  fileContext?: string
  imageUrls?: string[]
}

// ---------------------------------------------------------------------------
// QUICK mode
// ---------------------------------------------------------------------------

async function* runQuickMode(
  userMessage: string,
  options: PipelineOptions
): AsyncGenerator<SSEEvent, void, unknown> {
  // 1. Document search
  yield { type: 'status', phase: 'search', message: 'Recherche dans les documents...' }
  let chunks = await searchChunks(userMessage, 15)

  if (chunks.length === 0) {
    const totalChunks = await getChunkCount()
    if (totalChunks === 0 && !options.enableWebSearch && !options.fileContext) {
      yield {
        type: 'content',
        text: "**Aucun document dans la base.**\n\nAjoutez vos fichiers via le panneau **« Base de documents »** à gauche, ou activez la recherche web.",
      }
      yield { type: 'done' }
      return
    }
    if (totalChunks > 0) {
      chunks = await getRecentChunks(15)
    }
  }

  if (chunks.length > 0) {
    yield {
      type: 'sources',
      chunks: chunks.slice(0, 8).map((c) => ({ doc: c.document_name, excerpt: c.content.slice(0, 200) + '...' })),
    }
  }

  // 2. Web search (parallel with doc search result processing)
  let webResults: WebResult[] = []
  if (options.enableWebSearch) {
    yield { type: 'status', phase: 'web', message: 'Recherche sur le web...' }
    webResults = await searchWeb(userMessage, 5)
    if (webResults.length > 0) {
      yield { type: 'web_results', results: webResults.map((r) => ({ title: r.title, url: r.url })) }
    }
  }

  // 3. Build combined context
  let fullContext = ''
  if (chunks.length > 0) fullContext += buildContext(chunks)
  if (webResults.length > 0) fullContext += '\n' + buildWebContext(webResults)
  if (options.fileContext) fullContext += '\n---\n## FICHIERS JOINTS\n\n' + options.fileContext + '\n---\n'

  // 4. Generate answer
  yield { type: 'status', phase: 'generate', message: 'Génération de la réponse...' }

  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: `${fullContext}\n\n---\n\nQuestion ou demande de l'utilisateur :\n\n${userMessage}`,
    },
  ]

  for await (const token of streamLLM(messages, {
    system_prompt: QUICK_SYSTEM,
    max_completion_tokens: 8192,
    verbosity: 'medium',
    reasoning_effort: 'medium',
    model_tier: 'primary',
    image_input: options.imageUrls,
  })) {
    yield { type: 'content', text: token }
  }

  yield { type: 'done' }
}

// ---------------------------------------------------------------------------
// DEEP / Report mode
// ---------------------------------------------------------------------------

async function* runDeepMode(
  userMessage: string,
  options: PipelineOptions
): AsyncGenerator<SSEEvent, void, unknown> {
  // ── Phase 1: Research ──────────────────────────────────────────────────

  yield { type: 'status', phase: 'search', message: 'Analyse de la demande et recherche...' }
  const queries = await expandToSearchQueries(userMessage)

  // Document search (parallel)
  const docSearchPromise = multiQuerySearch(queries, 15, 60)

  // Web search (parallel, if enabled)
  let webResultsPromise: Promise<WebResult[]> = Promise.resolve([])
  if (options.enableWebSearch) {
    yield { type: 'status', phase: 'web', message: 'Recherche sur le web...' }
    webResultsPromise = multiWebSearch(queries.slice(0, 6), 4, 15).then((results) =>
      enrichWebResults(results, 4)
    )
  }

  const [allChunks, allWebResults] = await Promise.all([docSearchPromise, webResultsPromise])

  yield {
    type: 'status',
    phase: 'search',
    message: `${allChunks.length} extrait(s) de documents${allWebResults.length > 0 ? ` + ${allWebResults.length} résultat(s) web` : ''}.`,
  }

  if (allWebResults.length > 0) {
    yield { type: 'web_results', results: allWebResults.map((r) => ({ title: r.title, url: r.url })) }
  }

  // ── Phase 2: Planning ──────────────────────────────────────────────────

  yield { type: 'status', phase: 'plan', message: 'Élaboration du plan détaillé...' }

  let planContext = ''
  if (allChunks.length > 0) planContext += buildContext(allChunks.slice(0, 35))
  if (allWebResults.length > 0) planContext += '\n' + buildWebContext(allWebResults.slice(0, 8))
  if (options.fileContext) planContext += '\n---\n## FICHIERS JOINTS\n\n' + options.fileContext + '\n---\n'

  const outlineRaw = await completePrompt(
    [
      {
        role: 'user',
        content: `${planContext}\n\n---\n\nDemande de l'utilisateur :\n\n${userMessage}`,
      },
    ],
    OUTLINE_SYSTEM,
    4096
  )

  const sections = parseOutlineJson(outlineRaw)
  if (sections.length === 0) {
    sections.push(
      { title: 'Introduction', description: 'Contexte et objectif', search_queries: [userMessage] },
      { title: 'Analyse', description: 'Contenu principal', search_queries: [userMessage] },
      { title: 'Conclusion', description: 'Synthèse', search_queries: [userMessage] }
    )
  }

  yield { type: 'outline', sections }

  // ── Phase 3: Writing ───────────────────────────────────────────────────

  const total = sections.length
  const minCharsPerSection = 3000
  const collectedWebUrls: { title: string; url: string }[] = []
  const collectedDocSources = new Map<string, string>()

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i]
    yield { type: 'status', phase: 'generate', section: i + 1, total, title: sec.title }

    // Section-specific search
    const sectionDocQueries =
      sec.search_queries && sec.search_queries.length > 0
        ? sec.search_queries
        : [sec.title, userMessage]
    const sectionChunks = await multiQuerySearch(sectionDocQueries, 10, 25)

    let sectionWebResults: WebResult[] = []
    if (options.enableWebSearch) {
      const sectionWebQueries =
        sec.web_queries && sec.web_queries.length > 0
          ? sec.web_queries
          : [sec.title]
      sectionWebResults = await multiWebSearch(sectionWebQueries, 3, 6)
    }

    // Build section context
    let sectionContext = ''
    if (sectionChunks.length > 0) {
      sectionContext += buildContext(sectionChunks)
      for (const c of sectionChunks) {
        collectedDocSources.set(c.document_name, c.content.slice(0, 150) + '...')
      }
    }
    if (sectionWebResults.length > 0) {
      sectionContext += '\n' + buildWebContext(sectionWebResults)
      for (const r of sectionWebResults) {
        collectedWebUrls.push({ title: r.title, url: r.url })
      }
    }
    if (options.fileContext) {
      sectionContext += '\n---\n## FICHIERS JOINTS\n\n' + options.fileContext + '\n---\n'
    }

    const sectionMessages: ChatMessage[] = [
      {
        role: 'user',
        content: `${sectionContext}\n\n---\n\nRédige la section "${sec.title}" du rapport.\n${sec.description ? `Description attendue : ${sec.description}\n` : ''}Contexte global de la demande : ${userMessage}`,
      },
    ]

    for await (const token of streamLLM(sectionMessages, {
      system_prompt: buildSectionSystem(sec.title, minCharsPerSection),
      max_completion_tokens: 16384,
      verbosity: 'high',
      reasoning_effort: 'medium',
      model_tier: 'primary',
      image_input: options.imageUrls,
    })) {
      yield { type: 'content', text: token }
    }

    yield { type: 'content', text: '\n\n' }
  }

  // ── Phase 4: Sources ───────────────────────────────────────────────────

  const uniqueWebUrls = Array.from(
    new Map(collectedWebUrls.map((u) => [u.url, u])).values()
  )

  yield {
    type: 'sources',
    chunks: Array.from(collectedDocSources.entries())
      .slice(0, 20)
      .map(([doc, excerpt]) => ({ doc, excerpt })),
    webUrls: uniqueWebUrls.slice(0, 15),
  }

  yield { type: 'done' }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function* runPipeline(
  userMessage: string,
  options: PipelineOptions = {}
): AsyncGenerator<SSEEvent, void, unknown> {
  try {
    const mode = options.forceDeep ? 'deep' : classifyRequestFast(userMessage)

    if (mode === 'quick') {
      yield* runQuickMode(userMessage, options)
    } else {
      yield* runDeepMode(userMessage, options)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Une erreur est survenue.'
    yield { type: 'error', message }
    yield { type: 'done' }
  }
}
