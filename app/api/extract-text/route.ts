import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

export async function POST(request: NextRequest) {
  try {
    // Get the authenticated user from the authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { documentId, projectId, fileUrl, fileName, fileType } = body

    if (!documentId || !projectId || !fileUrl || !fileName || !fileType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Update document status to processing
    await supabaseAdmin
      .from('project_documents')
      .update({ processing_status: 'processing' })
      .eq('id', documentId)

    let extractedText = ''

    try {
      // For now, use Replicate Claude to extract text from files
      // This approach works for all file types and avoids build issues with native libraries
      
      // Download the file
      const fileResponse = await fetch(fileUrl)
      if (!fileResponse.ok) {
        throw new Error('Failed to download file')
      }

      const fileBuffer = await fileResponse.arrayBuffer()
      
      // Convert buffer to base64 for Claude
      const base64File = Buffer.from(fileBuffer).toString('base64')
      const dataUrl = `data:${fileType};base64,${base64File}`

      // For text files, extract directly
      if (fileType === 'text/plain' || fileType === 'text/csv') {
        extractedText = Buffer.from(fileBuffer).toString('utf-8')
      } else {
        // Use Claude to extract text from other document types
        try {
          const input = {
            prompt: `Please extract all the text content from this document. Return only the extracted text without any additional commentary or formatting. If this is a structured document (like a spreadsheet or table), preserve the structure using tabs and line breaks.`,
            image: dataUrl,
            max_tokens: 8192
          }

          let claudeResponse = ''
          for await (const event of replicate.stream("anthropic/claude-3.5-sonnet", { input })) {
            claudeResponse += event
          }

          extractedText = claudeResponse.trim()
        } catch (claudeError) {
          console.error('Claude extraction failed:', claudeError)
          // Fallback: create a placeholder with file info
          extractedText = `Document: ${fileName}\n\n[This ${fileType} document was uploaded but text extraction is temporarily unavailable. The file has been saved and you can ask questions about it, though responses may be limited.]`
        }
      }

      // Clean up the extracted text
      extractedText = extractedText.replace(/\s+/g, ' ').trim()

      if (!extractedText || extractedText.length < 10) {
        // Final fallback - create a basic file record
        extractedText = `Document: ${fileName}\n\nFile type: ${fileType}\nFile size: ${Buffer.from(fileBuffer).length} bytes\n\n[File uploaded successfully but text content could not be extracted automatically. You can still reference this file in conversations.]`
      }

      // Update the document with extracted text
      await supabaseAdmin
        .from('project_documents')
        .update({
          extracted_text: extractedText,
          text_length: extractedText.length,
          processing_status: 'completed'
        })
        .eq('id', documentId)

      // Get all completed documents for this project to build knowledge base
      const { data: documents, error: docsError } = await supabaseAdmin
        .from('project_documents')
        .select('extracted_text, original_filename')
        .eq('project_id', projectId)
        .eq('processing_status', 'completed')

      if (docsError) throw docsError

      // Combine all document texts into knowledge base
      let knowledgeBase = ''
      if (documents && documents.length > 0) {
        knowledgeBase = documents
          .filter(doc => doc.extracted_text)
          .map(doc => `--- Document: ${doc.original_filename} ---\n${doc.extracted_text}`)
          .join('\n\n')
      }

      // Update project with combined knowledge base
      await supabaseAdmin
        .from('projects')
        .update({
          knowledge_base: knowledgeBase,
          total_characters: knowledgeBase.length
        })
        .eq('id', projectId)

      return NextResponse.json({
        success: true,
        extractedText: extractedText.substring(0, 1000) + '...', // Return preview
        textLength: extractedText.length
      })

    } catch (extractionError) {
      console.error('Text extraction error:', extractionError)
      
      // Update document status to failed
      await supabaseAdmin
        .from('project_documents')
        .update({
          processing_status: 'failed',
          processing_error: extractionError instanceof Error ? extractionError.message : 'Unknown error'
        })
        .eq('id', documentId)

      return NextResponse.json({
        error: 'Text extraction failed',
        details: extractionError instanceof Error ? extractionError.message : 'Unknown error'
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Extract text API error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
