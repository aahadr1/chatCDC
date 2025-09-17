import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import Replicate from 'replicate'

export const dynamic = 'force-dynamic'

// Dolphin document parser model
const DOLPHIN_MODEL_ID = 'bytedance/dolphin:19f1ad93970c2bf21442a842d01d97fb04a94a69d2b36dee43531a9cbae07e85'

// Supported file types for Dolphin model
const SUPPORTED_TYPES = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
  'image/webp': '.webp'
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

    // Mark processing
    await supabaseAdmin
      .from('project_documents')
      .update({ processing_status: 'processing' })
      .eq('id', documentId)

    // Text extraction using Dolphin model only
    let extractedText = ''
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

    // Extract text using Dolphin model
    try {
      const input = { file: accessibleUrl, output_format: 'markdown_content' as const }
      console.log('🚀 Calling Dolphin with input:', { file: accessibleUrl, output_format: 'markdown_content' })
      
      // Add timeout to avoid indefinite processing
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Dolphin timeout after 2 minutes')), 2 * 60 * 1000)
      )
      
      const output: unknown = await Promise.race([
        replicate.run(DOLPHIN_MODEL_ID as `${string}/${string}:${string}`, { input }),
        timeout
      ])
      
      console.log('📄 Dolphin response received:', typeof output, output)

      if (typeof output === 'string') {
        extractedText = output.trim()
      } else if (Array.isArray(output)) {
        extractedText = (output as unknown[]).map((v) => String(v)).join('').trim()
      } else if (output && typeof output === 'object') {
        extractedText = JSON.stringify(output)
      } else {
        throw new Error('Unexpected response from Dolphin model')
      }

      // Clean up and validate result
      extractedText = extractedText.replace(/\s+$/g, '').trim()

      if (!extractedText || extractedText.length < 5) {
        throw new Error('Empty extraction result')
      }
      
      console.log('✅ Text extraction successful:', extractedText.length, 'characters')
        
    } catch (err) {
      console.error('❌ Text extraction failed:', err)
      console.error('Error details:', {
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined
      })
      
      // Mark failed and return
      await supabaseAdmin
        .from('project_documents')
        .update({ processing_status: 'failed', processing_error: err instanceof Error ? err.message : 'Extraction failed' })
        .eq('id', documentId)
      return NextResponse.json({ error: 'Text extraction failed', details: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
    }

    // Save extracted text
    const { error: updateError } = await supabaseAdmin
      .from('project_documents')
      .update({ 
        extracted_text: extractedText, 
        text_length: extractedText.length, 
        processing_status: 'completed'
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

    console.log(`🎉 Document processing completed successfully using Dolphin`)
    return NextResponse.json({ 
      success: true, 
      textLength: extractedText.length,
      message: `Text extracted successfully using Dolphin`
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
