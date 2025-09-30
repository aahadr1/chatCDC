import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { Buffer } from 'buffer'
import { performOCR } from '@/lib/ocrService'
import { getPDFInfo, convertPDFToImages } from '@/lib/pdfService'

export const dynamic = 'force-dynamic'

// Force Next.js to not pre-render this route
export const runtime = 'nodejs'

// Maximum file size for processing (50MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024

// Text confidence threshold for determining if text extraction is sufficient
const TEXT_CONFIDENCE_THRESHOLD = 0.1

// Supported file types
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

// Complete PDF processing with OCR
async function processPdfDocument(fileUrl: string, fileSize: number): Promise<{
  text: string
  method: string
  confidence: number
  pages?: number
}> {
  console.log('📄 Processing PDF document with OCR...')

  try {
    // Fetch PDF buffer
    const response = await fetch(fileUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.statusText}`)
    }

    const buffer = await response.arrayBuffer()

    // Get PDF info to determine processing strategy
    const pdfInfo = await getPDFInfo(buffer)
    console.log(`PDF Info: ${pdfInfo.pageCount} pages, hasText: ${pdfInfo.hasText}`)

    // If PDF has text and substantial content, try direct extraction first
    if (pdfInfo.hasText && pdfInfo.textContent && pdfInfo.textContent.length > 100) {
      console.log('📝 PDF contains substantial text, using direct extraction')

      // Calculate confidence based on text quality
      const textDensity = pdfInfo.textContent.length / (fileSize / 1024)
      const confidence = Math.min(textDensity * 2, 1)

      return {
        text: pdfInfo.textContent,
        method: 'direct-text',
        confidence: Math.max(confidence, 0.3), // Minimum confidence for text-based PDFs
        pages: pdfInfo.pageCount
      }
    }

    // If no text or insufficient text, use OCR
    console.log('🔍 PDF requires OCR processing')

    if (pdfInfo.pageCount === 0) {
      throw new Error('Could not read PDF structure')
    }

    // Convert PDF pages to images for OCR
    const images = await convertPDFToImages(buffer, Math.min(pdfInfo.pageCount, 5)) // Limit to 5 pages for performance

    if (images.length === 0) {
      throw new Error('Could not convert PDF pages to images')
    }

    console.log(`📷 Converted ${images.length} pages to images for OCR`)

    // Perform OCR on each page
    let fullText = ''
    let totalConfidence = 0
    let successfulPages = 0

    for (const image of images) {
      try {
        const ocrResult = await performOCR(image.buffer)

        if (ocrResult.text && ocrResult.text.trim().length > 0) {
          fullText += ocrResult.text.trim() + '\n\n'
          totalConfidence += ocrResult.confidence
          successfulPages++
          console.log(`✅ OCR successful for page ${image.pageNumber}: ${ocrResult.text.length} characters`)
        } else {
          console.log(`⚠️ OCR returned empty result for page ${image.pageNumber}`)
        }
      } catch (error) {
        console.error(`❌ OCR failed for page ${image.pageNumber}:`, error)
      }
    }

    const averageConfidence = successfulPages > 0 ? totalConfidence / successfulPages : 0

    if (fullText.trim().length === 0) {
      throw new Error('OCR processing failed to extract any text')
    }

    return {
      text: fullText.trim(),
      method: 'ocr-processed',
      confidence: averageConfidence,
      pages: pdfInfo.pageCount
    }

  } catch (error) {
    console.error('PDF processing failed:', error)

    return {
      text: `# PDF Processing Failed

**Error:** ${error instanceof Error ? error.message : 'Unknown error occurred'}

**File Details:**
- URL: ${fileUrl}
- Size: ${Math.round(fileSize / 1024)}KB

**Possible Issues:**
1. **Corrupted PDF:** The file may be damaged or encrypted
2. **Unsupported Format:** Some PDF types may not be fully supported
3. **OCR Service Issues:** External OCR services may be temporarily unavailable

**Recommended Solutions:**
1. **Verify PDF:** Ensure the PDF opens correctly in a PDF reader
2. **Try Different PDF:** Upload a different version or format
3. **Contact Support:** If the issue persists, please report it

**Technical Details:**
- Processing Method: Automated OCR Pipeline
- Pages Processed: Failed to determine
- Error Type: ${error instanceof Error ? error.constructor.name : 'Unknown'}`,
      method: 'failed',
      confidence: 0
    }
  }
}


// Main robust document processing function
async function processDocumentRobust(
  fileUrl: string,
  fileType: string,
  fileSize: number
): Promise<{ text: string; method: string; confidence: number; pages?: number }> {
  console.log(`🔍 Processing document: ${fileType}, ${Math.round(fileSize / 1024)}KB`)

  // Handle different file types
  if (fileType === 'text/plain') {
    const response = await fetch(fileUrl)
    const text = await response.text()
    return {
      text: text.trim(),
      method: 'text-direct',
      confidence: 1.0,
      pages: 1 // Text files are considered as 1 page
    }
  }

  if (fileType === 'application/pdf') {
    // Complete PDF processing with OCR
    return await processPdfDocument(fileUrl, fileSize)
  }

  // For other types (images, etc.), return not supported for now
  throw new Error(`File type ${fileType} requires specialized processing not yet implemented`)
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

      // Check file size limit
      if (fileSize > MAX_FILE_SIZE) {
        await supabaseAdmin
          .from('project_documents')
          .update({
            processing_status: 'failed',
            processing_error: `File too large: ${Math.round(fileSize / 1024 / 1024)}MB (max ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB)`
          })
          .eq('id', documentId)
        return NextResponse.json({
          error: 'File too large for processing',
          details: `Maximum file size is ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB`
        }, { status: 400 })
      }
    } catch (urlError) {
      console.error('❌ Error resolving file URL:', urlError)
    }

    // Extract text using robust processing
    let extractedText = ''
    let processingMethod = 'Unknown'
    let confidence = 0
    let pages: number | undefined

    try {
      console.log(`🔍 Starting robust text extraction for ${fileName}`)

      const result = await processDocumentRobust(
        accessibleUrl,
        fileType,
        fileSize
      )

      extractedText = result.text
      processingMethod = result.method
      confidence = result.confidence
      pages = result.pages

      // Final validation
      if (!extractedText || extractedText.length < 5) {
        throw new Error('Insufficient text extracted from document')
      }

      console.log(`✅ Robust extraction completed: ${extractedText.length} characters extracted using ${processingMethod}`)

    } catch (err) {
      console.error('❌ Robust text extraction failed:', err)
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
          processing_error: err instanceof Error ? err.message : 'Robust text extraction failed',
          processing_notes: `Failed with file: ${fileName} (${fileType}, ${Math.round(fileSize / 1024)}KB) - Method: ${processingMethod}`
        })
        .eq('id', documentId)
      return NextResponse.json({
        error: 'Document text extraction failed',
        details: err instanceof Error ? err.message : 'Unknown error',
        method: processingMethod
      }, { status: 500 })
    }

    // Save extracted text with processing details
    const { error: updateError } = await supabaseAdmin
      .from('project_documents')
      .update({
        extracted_text: extractedText,
        text_length: extractedText.length,
        processing_status: 'completed',
        processing_notes: `Successfully processed using: ${processingMethod} (confidence: ${Math.round(confidence * 100)}%, pages: ${pages || 'unknown'})`
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

    console.log(`🔍 Document processing completed successfully using ${processingMethod}`)
    console.log(`📊 Final stats: ${extractedText.length} characters, ${Math.round(fileSize / 1024)}KB processed`)

    return NextResponse.json({
      success: true,
      textLength: extractedText.length,
      processingMethod: processingMethod,
      confidence: Math.round(confidence * 100),
      pages: pages || 'unknown',
      fileSize: Math.round(fileSize / 1024),
      message: `Text extracted and organized successfully using ${processingMethod} processing`
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
