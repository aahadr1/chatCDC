/**
 * CDC Agent: extract text from PDF/DOCX/TXT and chunk for full-text search.
 * Chunks ~1500 chars with ~300 char overlap, paragraph-aware.
 */

const CHUNK_SIZE = 1500
const CHUNK_OVERLAP = 300

export interface ProcessedDocument {
  name: string
  fileType: string
  fileSize: number
  contentText: string
  chunks: { content: string; index: number }[]
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
  const data = await pdfParse(buffer)
  return data.text || ''
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value || ''
}

/**
 * Extract plain text from a file (Buffer or string).
 * Supports: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/*
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  const trimmed = (s: string) => s.replace(/\s+/g, ' ').trim()
  if (mimeType === 'application/pdf') {
    return trimmed(await extractPdf(buffer))
  }
  if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileName.toLowerCase().endsWith('.docx')
  ) {
    return trimmed(await extractDocx(buffer))
  }
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    return trimmed(buffer.toString('utf-8'))
  }
  throw new Error(`Unsupported file type for text extraction: ${mimeType}`)
}

/**
 * Split text into paragraphs (double newline or long single newlines).
 */
function splitIntoParagraphs(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  const blocks = normalized.split(/\n\s*\n/)
  return blocks.filter((p) => p.trim().length > 0)
}

/**
 * Chunk text into ~CHUNK_SIZE character segments with CHUNK_OVERLAP overlap.
 * Prefers splitting on paragraph boundaries.
 */
export function chunkText(text: string): { content: string; index: number }[] {
  const paragraphs = splitIntoParagraphs(text)
  const chunks: { content: string; index: number }[] = []
  let current = ''
  let currentLen = 0
  let chunkIndex = 0
  const pushCurrent = () => {
    const trimmed = current.replace(/\s+/g, ' ').trim()
    if (trimmed.length > 0) {
      chunks.push({ content: trimmed, index: chunkIndex++ })
    }
    current = ''
    currentLen = 0
  }

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]
    const pWithNewline = p + '\n\n'
    const pLen = pWithNewline.length

    if (currentLen + pLen <= CHUNK_SIZE) {
      current += pWithNewline
      currentLen += pLen
      continue
    }

    if (currentLen > 0) {
      pushCurrent()
    }

    if (p.length <= CHUNK_SIZE) {
      current = pWithNewline
      currentLen = pLen
      continue
    }

    for (let j = 0; j < p.length; j += CHUNK_SIZE - CHUNK_OVERLAP) {
      const segment = p.slice(j, j + CHUNK_SIZE)
      if (segment.trim().length > 0) {
        chunks.push({ content: segment.trim(), index: chunkIndex++ })
      }
    }
  }

  if (current.trim().length > 0) {
    chunks.push({ content: current.replace(/\s+/g, ' ').trim(), index: chunkIndex })
  }

  return chunks
}

/**
 * Full pipeline: extract text and chunk. Returns content + chunks for DB storage.
 */
export async function processDocument(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  fileSize: number
): Promise<ProcessedDocument> {
  const contentText = await extractText(buffer, mimeType, fileName)
  const chunks = chunkText(contentText)
  return {
    name: fileName,
    fileType: mimeType,
    fileSize,
    contentText,
    chunks,
  }
}
