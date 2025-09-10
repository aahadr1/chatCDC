import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      }
    )

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { documentId, projectId, fileUrl, fileName, fileType } = body

    if (!documentId || !projectId || !fileUrl || !fileName || !fileType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Update document status to processing
    await supabase
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

      // Use Claude to extract text from the document
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

      // Fallback for text files if Claude extraction fails
      if ((!extractedText || extractedText.length < 10) && 
          (fileType === 'text/plain' || fileType === 'text/csv')) {
        extractedText = Buffer.from(fileBuffer).toString('utf-8')
      }

      // Clean up the extracted text
      extractedText = extractedText.replace(/\s+/g, ' ').trim()

      if (!extractedText || extractedText.length < 10) {
        throw new Error('No meaningful text could be extracted from the file')
      }

      // Update the document with extracted text
      await supabase
        .from('project_documents')
        .update({
          extracted_text: extractedText,
          text_length: extractedText.length,
          processing_status: 'completed'
        })
        .eq('id', documentId)

      // Get all completed documents for this project to build knowledge base
      const { data: documents, error: docsError } = await supabase
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
      await supabase
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
      await supabase
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
