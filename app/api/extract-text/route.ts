import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import Replicate from 'replicate'

// Model id (pinned) for Dolphin document parser on Replicate
const DOLPHIN_MODEL_ID = 'bytedance/dolphin:19f1ad93970c2bf21442a842d01d97fb04a94a69d2b36dee43531a9cbae07e85'

export async function POST(request: NextRequest) {
  try {
    // Validate server configuration
    if (!process.env.REPLICATE_API_TOKEN) {
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

    if (!documentId || !projectId || !fileUrl || !fileName || !fileType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Only allow PDFs and images
    const isPdf = fileType === 'application/pdf'
    const isImage = fileType.startsWith('image/')
    if (!isPdf && !isImage) {
      await supabaseAdmin
        .from('project_documents')
        .update({ processing_status: 'failed', processing_error: `Unsupported file type: ${fileType}` })
        .eq('id', documentId)
      return NextResponse.json({ error: 'Unsupported file type. Only PDF and images are supported.' }, { status: 400 })
    }

    // Mark processing
    await supabaseAdmin
      .from('project_documents')
      .update({ processing_status: 'processing' })
      .eq('id', documentId)

    // Call Dolphin with direct file URL
    let extractedText = ''
    try {
      const input = { file: fileUrl, output_format: 'markdown_content' as const }
      const output = await replicate.run(DOLPHIN_MODEL_ID, { input })

      if (typeof output === 'string') {
        extractedText = output.trim()
      } else if (Array.isArray(output)) {
        extractedText = output.join('').trim()
      } else if (output && typeof output === 'object') {
        extractedText = JSON.stringify(output)
      } else {
        throw new Error('Unexpected response from Dolphin model')
      }

      // Minimal cleanup while preserving structure
      extractedText = extractedText.replace(/\s+$/g, '').trim()

      if (!extractedText || extractedText.length < 5) {
        throw new Error('Empty extraction result')
      }
    } catch (err) {
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
      .update({ extracted_text: extractedText, text_length: extractedText.length, processing_status: 'completed' })
      .eq('id', documentId)
    if (updateError) {
      return NextResponse.json({ error: 'Failed to save extracted text' }, { status: 500 })
    }

    // Rebuild project knowledge base from completed docs
    const { data: documents, error: docsError } = await supabaseAdmin
      .from('project_documents')
      .select('extracted_text, original_filename')
      .eq('project_id', projectId)
      .eq('processing_status', 'completed')
    if (docsError) {
      return NextResponse.json({ error: 'Failed to read documents' }, { status: 500 })
    }

    const knowledgeBase = (documents || [])
      .filter(d => !!d.extracted_text)
      .map(d => `--- Document: ${d.original_filename} ---\n${d.extracted_text}`)
      .join('\n\n')

    await supabaseAdmin
      .from('projects')
      .update({ knowledge_base: knowledgeBase, total_characters: knowledgeBase.length })
      .eq('id', projectId)

    return NextResponse.json({ success: true, textLength: extractedText.length })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
