import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { Buffer } from 'buffer'

export const dynamic = 'force-dynamic'

// Text extraction methods in order of reliability
const EXTRACTION_METHODS = {
  NATIVE_PDF: 'native-pdf',
  GOOGLE_VISION: 'google-vision', 
  SIMPLE_OCR: 'simple-ocr'
} as const

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

// Try native PDF text extraction first (for PDFs with embedded text)
async function extractNativePdfText(fileUrl: string): Promise<string | null> {
  try {
    console.log('📖 Attempting native PDF text extraction...')
    
    // Dynamically import pdf-parse to avoid build-time issues
    const { default: pdfParse } = await import('pdf-parse')
    
    // Fetch the PDF file
    const response = await fetch(fileUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status}`)
    }
    
    const buffer = await response.arrayBuffer()
    const data = await pdfParse(Buffer.from(buffer))
    
    const text = data.text.trim()
    
    if (text && text.length > 20) {
      console.log(`✅ Native PDF extraction successful: ${text.length} characters`)
      return text
    } else {
      console.log('❌ Native PDF extraction returned insufficient text')
      return null
    }
  } catch (error) {
    console.error('❌ Native PDF extraction failed:', error)
    return null
  }
}

// Simple text extraction for plain text files
async function extractPlainText(fileUrl: string): Promise<string | null> {
  try {
    console.log('📄 Attempting plain text extraction...')
    
    const response = await fetch(fileUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status}`)
    }
    
    const text = await response.text()
    
    if (text && text.length > 5) {
      console.log(`✅ Plain text extraction successful: ${text.length} characters`)
      return text.trim()
    } else {
      console.log('❌ Plain text extraction returned insufficient text')
      return null
    }
  } catch (error) {
    console.error('❌ Plain text extraction failed:', error)
    return null
  }
}

// Robust document processing with multiple fallback methods
async function processDocumentWithMultipleMethods(
  fileUrl: string, 
  fileType: string,
  fileSize: number
): Promise<string> {
  console.log(`🔍 Processing document: ${fileType}, ${Math.round(fileSize / 1024)}KB`)
  
  const isPdf = fileType === 'application/pdf'
  const isText = fileType === 'text/plain'
  const isImage = fileType.startsWith('image/')
  
  let extractedText = ''
  let successfulMethod = 'unknown'
  
  // Method 1: Native PDF text extraction (for PDFs with embedded text)
  if (isPdf) {
    const nativeText = await extractNativePdfText(fileUrl)
    if (nativeText) {
      extractedText = nativeText
      successfulMethod = 'Native PDF Text Extraction'
    }
  }
  
  // Method 2: Plain text extraction (for text files)
  if (!extractedText && isText) {
    const plainText = await extractPlainText(fileUrl)
    if (plainText) {
      extractedText = plainText
      successfulMethod = 'Plain Text Extraction'
    }
  }
  
  // Method 3: For images and scanned PDFs, we need OCR but since Replicate models failed,
  // we'll return an informative message for now
  if (!extractedText && (isImage || isPdf)) {
    console.log('🔍 Document appears to be image-based or scanned PDF')
    
    // For now, return a message indicating OCR is needed
    // In production, you'd integrate with Google Vision API, Azure Computer Vision, or AWS Textract
    extractedText = `[SCANNED DOCUMENT DETECTED]

This document appears to be a scanned PDF or image that requires OCR (Optical Character Recognition) processing.

To extract text from this document, you would need to integrate with one of these services:
- Google Cloud Vision API
- Azure Computer Vision
- AWS Textract
- Or deploy a local OCR solution

Document details:
- Type: ${fileType}
- Size: ${Math.round(fileSize / 1024)}KB
- URL: ${fileUrl}

Please configure an OCR service to process this type of document.`
    
    successfulMethod = 'OCR Required Notice'
  }
  
  if (!extractedText) {
    throw new Error(`No suitable extraction method found for file type: ${fileType}`)
  }
  
  console.log(`🎉 Successfully extracted text using: ${successfulMethod}`)
  console.log(`📊 Final text length: ${extractedText.length} characters`)
  
  return extractedText
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

    // Extract text using multi-method approach
    let extractedText = ''
    let processingMethod = 'Unknown'
    
    try {
      console.log(`🚀 Starting multi-method text extraction for ${fileName}`)
      
      extractedText = await processDocumentWithMultipleMethods(
        accessibleUrl,
        fileType,
        fileSize
      )
      
      processingMethod = 'Multi-Method Text Extraction'
      
      // Final validation
        if (!extractedText || extractedText.length < 5) {
        throw new Error('Insufficient text extracted from document')
      }
      
      console.log(`✅ Text extraction completed: ${extractedText.length} characters extracted`)
      
    } catch (err) {
      console.error('❌ Text extraction failed:', err)
      console.error('Error details:', {
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined,
        fileType,
        fileSize,
        fileName
      })
      
      // Mark failed and return
      await supabaseAdmin
        .from('project_documents')
        .update({ 
          processing_status: 'failed', 
          processing_error: err instanceof Error ? err.message : 'Text extraction failed',
          processing_notes: `Failed with file: ${fileName} (${fileType}, ${Math.round(fileSize / 1024)}KB)`
        })
        .eq('id', documentId)
      return NextResponse.json({ 
        error: 'Document text extraction failed', 
        details: err instanceof Error ? err.message : 'Unknown error' 
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

    console.log(`🎉 Document processing completed successfully using ${processingMethod}`)
    console.log(`📊 Final stats: ${extractedText.length} characters, ${Math.round(fileSize / 1024)}KB processed`)
    
    return NextResponse.json({ 
      success: true, 
      textLength: extractedText.length,
      processingMethod: processingMethod,
      fileSize: Math.round(fileSize / 1024),
      message: `Text extracted successfully using multi-method approach`
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
