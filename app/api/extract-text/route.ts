import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { Buffer } from 'buffer'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

// LLM-based extraction models with massive context windows and vision capabilities
const LLM_MODELS = {
  // GPT-4o - 128K context, excellent vision capabilities
  GPT4O: 'gpt-4o',
  
  // Claude 3.5 Sonnet - 200K context, superior document understanding
  CLAUDE_35: 'claude-3-5-sonnet-20241022',
  
  // GPT-4o mini - Fast and efficient for smaller documents
  GPT4O_MINI: 'gpt-4o-mini'
} as const

// Document extraction prompt for LLMs
const EXTRACTION_PROMPT = `You are a professional document processing AI with expertise in extracting and organizing text from various document types. Your task is to:

1. **EXTRACT ALL TEXT** from the provided document (PDF, image, scan, etc.)
2. **PRESERVE STRUCTURE** including headers, paragraphs, lists, tables
3. **ORGANIZE LOGICALLY** with clear formatting and hierarchy
4. **HANDLE ANY LANGUAGE** and maintain original meaning
5. **PROCESS ANY QUALITY** from high-resolution native PDFs to poor-quality scans

**OUTPUT FORMAT:**
Return the extracted text in clean, organized markdown format with:
- Clear headings and subheadings
- Proper paragraph breaks
- Tables formatted as markdown tables
- Lists formatted as markdown lists
- Important information highlighted

**SPECIAL INSTRUCTIONS:**
- If text is unclear, use [UNCLEAR: best guess] notation
- For mathematical formulas, use LaTeX notation
- For complex tables, describe structure if markdown isn't sufficient
- Always prioritize completeness over perfection

Extract and organize ALL text content from this document:`

// Maximum file size for single processing (10MB)
const MAX_SINGLE_FILE_SIZE = 10 * 1024 * 1024

// Maximum pages per segment
const MAX_PAGES_PER_SEGMENT = 5

// Supported file types - comprehensive document support
const SUPPORTED_TYPES = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg', 
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/svg+xml': '.svg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
  'text/plain': '.txt',
  'application/rtf': '.rtf'
}

// Convert file to base64 for LLM processing
async function fileToBase64(fileUrl: string): Promise<string> {
  const response = await fetch(fileUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status}`)
  }
  const buffer = await response.arrayBuffer()
  return Buffer.from(buffer).toString('base64')
}

// Extract text using OpenAI GPT-4o with vision
async function extractWithGPT4o(fileUrl: string, fileType: string): Promise<string> {
  console.log('🤖 Attempting extraction with GPT-4o...')
  
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured')
  }
  
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  
  const isPdf = fileType === 'application/pdf'
  const isImage = fileType.startsWith('image/')
  const isText = fileType === 'text/plain'
  
  // For text files, fetch content directly
  if (isText) {
    const response = await fetch(fileUrl)
    const textContent = await response.text()
    
    const completion = await openai.chat.completions.create({
      model: LLM_MODELS.GPT4O,
      messages: [
        {
          role: "system",
          content: EXTRACTION_PROMPT
        },
        {
          role: "user",
          content: `Please extract and organize the text from this document:\n\n${textContent}`
        }
      ],
      max_tokens: 4000
    })
    
    return completion.choices[0]?.message?.content || ''
  }
  
  // For images and PDFs, use vision capabilities
  if (isImage || isPdf) {
    const base64 = await fileToBase64(fileUrl)
    const mimeType = fileType === 'application/pdf' ? 'image/png' : fileType // PDFs will be treated as images
    
    const completion = await openai.chat.completions.create({
      model: LLM_MODELS.GPT4O,
      messages: [
        {
          role: "system", 
          content: EXTRACTION_PROMPT
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please extract and organize ALL text from this document. Handle any quality level from perfect scans to poor quality images."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: "high"
              }
            }
          ]
        }
      ],
      max_tokens: 4000
    })
    
    return completion.choices[0]?.message?.content || ''
  }
  
  throw new Error(`Unsupported file type for GPT-4o: ${fileType}`)
}

// Extract text using Claude 3.5 Sonnet with vision
async function extractWithClaude35(fileUrl: string, fileType: string): Promise<string> {
  console.log('🧠 Attempting extraction with Claude 3.5 Sonnet...')
  
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured')
  }
  
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  
  const isPdf = fileType === 'application/pdf'
  const isImage = fileType.startsWith('image/')
  const isText = fileType === 'text/plain'
  
  // For text files, process directly
  if (isText) {
    const response = await fetch(fileUrl)
    const textContent = await response.text()
    
    const message = await anthropic.messages.create({
      model: LLM_MODELS.CLAUDE_35,
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `${EXTRACTION_PROMPT}\n\nDocument content:\n${textContent}`
        }
      ]
    })
    
    return message.content[0]?.type === 'text' ? message.content[0].text : ''
  }
  
  // For images and PDFs, use vision capabilities
  if (isImage || isPdf) {
    const base64 = await fileToBase64(fileUrl)
    const mimeType = fileType === 'application/pdf' ? 'image/png' : fileType
    
    const message = await anthropic.messages.create({
      model: LLM_MODELS.CLAUDE_35,
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${EXTRACTION_PROMPT}\n\nPlease extract and organize ALL text from this document image.`
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType as any,
                data: base64
              }
            }
          ]
        }
      ]
    })
    
    return message.content[0]?.type === 'text' ? message.content[0].text : ''
  }
  
  throw new Error(`Unsupported file type for Claude: ${fileType}`)
}

// Fallback: Simple PDF text extraction for native PDFs
async function extractNativePdfText(fileUrl: string): Promise<string> {
  console.log('📄 Attempting native PDF text extraction as fallback...')
  
  const { default: pdfParse } = await import('pdf-parse')
  const response = await fetch(fileUrl)
  const buffer = await response.arrayBuffer()
  const data = await pdfParse(Buffer.from(buffer))
  
  return data.text.trim()
}

// Main LLM-based document processing with intelligent fallbacks
async function processDocumentWithLLM(
  fileUrl: string,
  fileType: string,
  fileSize: number
): Promise<{ text: string; method: string }> {
  console.log(`🧠 Processing document with LLM: ${fileType}, ${Math.round(fileSize / 1024)}KB`)
  
  const isPdf = fileType === 'application/pdf'
  const isImage = fileType.startsWith('image/')
  const isText = fileType === 'text/plain'
  
  // Define extraction strategies in order of preference
  const strategies = [
    { name: 'Claude 3.5 Sonnet', fn: () => extractWithClaude35(fileUrl, fileType) },
    { name: 'GPT-4o', fn: () => extractWithGPT4o(fileUrl, fileType) }
  ]
  
  // Add native PDF extraction as fallback for PDFs
  if (isPdf) {
    strategies.push({ 
      name: 'Native PDF Parser', 
      fn: () => extractNativePdfText(fileUrl) 
    })
  }
  
  // Try each strategy
  for (const strategy of strategies) {
    try {
      console.log(`🚀 Trying: ${strategy.name}`)
      
      const extractedText = await strategy.fn()
      
      if (extractedText && extractedText.length > 20) {
        console.log(`✅ ${strategy.name} succeeded: ${extractedText.length} characters`)
        return {
          text: extractedText,
          method: strategy.name
        }
      } else {
        throw new Error(`Insufficient text extracted: ${extractedText.length} characters`)
      }
      
    } catch (error) {
      console.error(`❌ ${strategy.name} failed:`, error)
      continue
    }
  }
  
  throw new Error('All LLM extraction methods failed')
}

export async function POST(request: NextRequest) {
  try {
    console.log('📝 Extract text API called')

    // Authenticate user from Bearer token
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = authHeader.substring(7)
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse body
    const body = await request.json()
    const { documentId, projectId, fileUrl, fileName, fileType } = body as {
      documentId: string
      projectId: string
      fileUrl: string
      fileName: string
      fileType: string
    }

    console.log('📄 Processing file:', { fileName, fileType, documentId })

    if (!documentId || !projectId || !fileUrl || !fileName || !fileType) {
      console.error('❌ Missing required fields')
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check if file type is supported
    if (!SUPPORTED_TYPES[fileType as keyof typeof SUPPORTED_TYPES]) {
      await supabaseAdmin
        .from('project_documents')
        .update({ processing_status: 'failed', processing_error: `Unsupported file type: ${fileType}` })
        .eq('id', documentId)
      return NextResponse.json({ 
        error: `Unsupported file type: ${fileType}. Supported types: ${Object.keys(SUPPORTED_TYPES).join(', ')}` 
      }, { status: 400 })
    }

    // Mark processing
    await supabaseAdmin
      .from('project_documents')
      .update({ processing_status: 'processing' })
      .eq('id', documentId)

    // Get file size for processing decisions
    let fileSize = 0
    let accessibleUrl = fileUrl as string

    // Resolve an accessible URL for the file (prefer signed URL from storage)
    try {
      const { data: docRow } = await supabaseAdmin
        .from('project_documents')
        .select('filename, file_size')
        .eq('id', documentId)
        .single()

      if (docRow?.filename) {
        const { data: signed, error: signErr } = await supabaseAdmin
          .storage
          .from('project-documents')
          .createSignedUrl(docRow.filename, 60 * 15) // 15 minutes for large files
        if (!signErr && signed?.signedUrl) {
          accessibleUrl = signed.signedUrl
        }
      }

      fileSize = docRow?.file_size || 0
    } catch (urlError) {
      console.error('❌ Error resolving file URL:', urlError)
    }

    // Extract text using LLM-based approach
    let extractedText = ''
    let processingMethod = 'Unknown'
    
    try {
      console.log(`🧠 Starting LLM-based text extraction for ${fileName}`)
      
      const result = await processDocumentWithLLM(
        accessibleUrl,
        fileType,
        fileSize
      )
      
      extractedText = result.text
      processingMethod = `LLM Processing: ${result.method}`
      
      // Final validation
        if (!extractedText || extractedText.length < 5) {
        throw new Error('Insufficient text extracted from document')
      }
      
      console.log(`✅ LLM extraction completed: ${extractedText.length} characters extracted`)
        
    } catch (err) {
      console.error('❌ LLM text extraction failed:', err)
      console.error('Error details:', {
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined,
        fileType,
        fileSize,
        fileName,
        availableKeys: {
          openai: !!process.env.OPENAI_API_KEY,
          anthropic: !!process.env.ANTHROPIC_API_KEY
        }
      })
      
      // Mark failed and return
      await supabaseAdmin
        .from('project_documents')
        .update({ 
          processing_status: 'failed', 
          processing_error: err instanceof Error ? err.message : 'LLM text extraction failed',
          processing_notes: `Failed with file: ${fileName} (${fileType}, ${Math.round(fileSize / 1024)}KB) - Check API keys`
        })
        .eq('id', documentId)
      return NextResponse.json({ 
        error: 'Document text extraction failed', 
        details: err instanceof Error ? err.message : 'Unknown error',
        suggestion: 'Please ensure OPENAI_API_KEY or ANTHROPIC_API_KEY is configured'
      }, { status: 500 })
    }

    // Save extracted text with processing details
    const { error: updateError } = await supabaseAdmin
      .from('project_documents')
      .update({ 
        extracted_text: extractedText, 
        text_length: extractedText.length, 
        processing_status: 'completed',
        processing_notes: `Successfully processed using: ${processingMethod}`
      })
      .eq('id', documentId)
    if (updateError) {
      console.error('❌ Failed to save extracted text:', updateError)
      return NextResponse.json({ error: 'Failed to save extracted text' }, { status: 500 })
    }

    // Rebuild project knowledge base from completed docs
    const { data: documents, error: docsError } = await supabaseAdmin
      .from('project_documents')
      .select('extracted_text, original_filename')
      .eq('project_id', projectId)
      .eq('processing_status', 'completed')
    if (docsError) {
      console.error('❌ Failed to read documents for knowledge base:', docsError)
      return NextResponse.json({ error: 'Failed to read documents' }, { status: 500 })
    }

    const knowledgeBase = (documents || [])
      .filter(d => !!d.extracted_text)
      .map(d => `--- Document: ${d.original_filename} ---\n${d.extracted_text}`)
      .join('\n\n')

    const { error: kbUpdateError } = await supabaseAdmin
      .from('projects')
      .update({ knowledge_base: knowledgeBase, total_characters: knowledgeBase.length })
      .eq('id', projectId)

    if (kbUpdateError) {
      console.error('❌ Failed to update knowledge base:', kbUpdateError)
    }

    console.log(`🧠 Document processing completed successfully using ${processingMethod}`)
    console.log(`📊 Final stats: ${extractedText.length} characters, ${Math.round(fileSize / 1024)}KB processed`)
    
    return NextResponse.json({ 
      success: true, 
      textLength: extractedText.length,
      processingMethod: processingMethod,
      fileSize: Math.round(fileSize / 1024),
      message: `Text extracted and organized successfully using advanced LLM processing`
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
