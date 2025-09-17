import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import Replicate from 'replicate'
import pdfParse from 'pdf-parse'

// Model ids for text extraction with fallback strategy
const DOLPHIN_MODEL_ID = 'bytedance/dolphin:19f1ad93970c2bf21442a842d01d97fb04a94a69d2b36dee43531a9cbae07e85'
const OCR_MODEL_ID = 'abiruyt/text-extract-ocr:a524caeaa23495bc9edc2f2d3dd09ba49a0eae7671aed4018532343b75e57094'

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
  'text/plain': '.txt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc'
}

export async function POST(request: NextRequest) {
  try {
    console.log('📝 Extract text API called')
    
    // Validate server configuration
    if (!process.env.REPLICATE_API_TOKEN) {
      console.error('❌ REPLICATE_API_TOKEN not configured')
      return NextResponse.json({ error: 'Server misconfiguration: REPLICATE_API_TOKEN is not set' }, { status: 500 })
    }

    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

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

    const isPdf = fileType === 'application/pdf'
    const isImage = fileType.startsWith('image/')
    const isText = fileType === 'text/plain'
    const isDoc = fileType.includes('word') || fileType.includes('document')

    // Mark processing
    await supabaseAdmin
      .from('project_documents')
      .update({ processing_status: 'processing' })
      .eq('id', documentId)

    // Multi-tier text extraction with fallback strategy
    let extractedText = ''
    let extractionMethod = 'unknown'
    let accessibleUrl = fileUrl as string
    
    // Resolve an accessible URL for the file (prefer signed URL from storage)
    try {
      const { data: docRow } = await supabaseAdmin
        .from('project_documents')
        .select('filename')
        .eq('id', documentId)
        .single()

      if (docRow?.filename) {
        const { data: signed, error: signErr } = await supabaseAdmin
          .storage
          .from('project-documents')
          .createSignedUrl(docRow.filename, 60 * 10) // 10 minutes
        if (!signErr && signed?.signedUrl) {
          accessibleUrl = signed.signedUrl
        }
      }
    } catch (urlError) {
      console.error('❌ Error resolving file URL:', urlError)
    }

    // Define extraction strategies based on file type and capabilities
    const extractionStrategies = []
    
    if (isPdf || isImage) {
      // Tier 1: Dolphin (best for complex layouts and mixed content)
      extractionStrategies.push({
        name: 'Dolphin Document Parser',
        method: 'dolphin',
        modelId: DOLPHIN_MODEL_ID,
        input: { file: accessibleUrl, output_format: 'markdown_content' as const },
        timeout: 2 * 60 * 1000 // 2 minutes
      })
      
      // Tier 2: OCR Model (good for scanned documents and images)
      extractionStrategies.push({
        name: 'OCR Text Extractor',
        method: 'ocr',
        modelId: OCR_MODEL_ID,
        input: { image: accessibleUrl },
        timeout: 90 * 1000 // 1.5 minutes
      })
    }
    
    if (isPdf) {
      // Tier 3: Direct PDF parsing (lightweight, good for native text PDFs)
      extractionStrategies.push({
        name: 'Direct PDF Parser',
        method: 'pdf-parse',
        modelId: null,
        input: { url: accessibleUrl },
        timeout: 30 * 1000 // 30 seconds
      })
    }
    
    if (isText) {
      // Simple text file extraction
      extractionStrategies.push({
        name: 'Plain Text Extractor',
        method: 'text',
        modelId: null,
        input: { url: accessibleUrl },
        timeout: 10 * 1000 // 10 seconds
      })
    }

    // Attempt extraction with fallback strategy
    for (const strategy of extractionStrategies) {
      try {
        console.log(`🚀 Attempting extraction with: ${strategy.name}`)
        
        let result: string = ''
        
        if (strategy.method === 'dolphin' || strategy.method === 'ocr') {
          // Replicate-based extraction
          const timeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`${strategy.name} timeout`)), strategy.timeout)
          )
          
          const output: unknown = await Promise.race([
            replicate.run(strategy.modelId!, { input: strategy.input }),
            timeout
          ])
          
          if (typeof output === 'string') {
            result = output.trim()
          } else if (Array.isArray(output)) {
            result = (output as unknown[]).map((v) => String(v)).join('').trim()
          } else if (output && typeof output === 'object') {
            result = JSON.stringify(output)
          }
        } else if (strategy.method === 'pdf-parse') {
          // Direct PDF parsing fallback
          const response = await fetch(accessibleUrl)
          const buffer = await response.arrayBuffer()
          const data = await pdfParse(Buffer.from(buffer))
          result = data.text.trim()
        } else if (strategy.method === 'text') {
          // Simple text extraction
          const response = await fetch(accessibleUrl)
          result = await response.text()
        }
        
        // Clean up and validate result
        result = result.replace(/\s+$/g, '').trim()
        
        if (result && result.length >= 5) {
          extractedText = result
          extractionMethod = strategy.name
          console.log(`✅ Text extraction successful with ${strategy.name}: ${result.length} characters`)
          break
        } else {
          throw new Error(`${strategy.name} returned empty or insufficient text`)
        }
        
      } catch (strategyError) {
        console.error(`❌ ${strategy.name} failed:`, strategyError)
        
        // If this was the last strategy, we'll handle the failure below
        if (strategy === extractionStrategies[extractionStrategies.length - 1]) {
          throw new Error(`All extraction methods failed. Last error: ${strategyError instanceof Error ? strategyError.message : 'Unknown error'}`)
        }
        
        // Continue to next strategy
        continue
      }
    }
    
    // If no extraction succeeded
    if (!extractedText) {
      const errorMsg = `Failed to extract text using any available method for file type: ${fileType}`
      console.error(`❌ ${errorMsg}`)
      
      await supabaseAdmin
        .from('project_documents')
        .update({ processing_status: 'failed', processing_error: errorMsg })
        .eq('id', documentId)
      return NextResponse.json({ error: errorMsg }, { status: 500 })
    }

    // Save extracted text with extraction method info
    const { error: updateError } = await supabaseAdmin
      .from('project_documents')
      .update({ 
        extracted_text: extractedText, 
        text_length: extractedText.length, 
        processing_status: 'completed',
        processing_notes: `Extracted using: ${extractionMethod}`
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

    console.log(`🎉 Document processing completed successfully using ${extractionMethod}`)
    return NextResponse.json({ 
      success: true, 
      textLength: extractedText.length,
      extractionMethod: extractionMethod,
      message: `Text extracted successfully using ${extractionMethod}`
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
