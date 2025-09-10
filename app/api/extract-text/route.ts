import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Replicate from 'replicate'
import pdf from 'pdf-parse'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'

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
      // Download the file
      const fileResponse = await fetch(fileUrl)
      if (!fileResponse.ok) {
        throw new Error('Failed to download file')
      }

      const fileBuffer = await fileResponse.arrayBuffer()
      const buffer = Buffer.from(fileBuffer)

      // Extract text based on file type
      if (fileType === 'application/pdf') {
        // Extract text from PDF
        const data = await pdf(buffer)
        extractedText = data.text
      } else if (fileType === 'application/msword' || 
                 fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // Extract text from Word documents
        const result = await mammoth.extractRawText({ buffer })
        extractedText = result.value
      } else if (fileType === 'application/vnd.ms-excel' || 
                 fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        // Extract text from Excel files
        const workbook = XLSX.read(buffer, { type: 'buffer' })
        let allText = ''
        
        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName]
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
          
          allText += `\n--- Sheet: ${sheetName} ---\n`
          jsonData.forEach((row: any) => {
            if (Array.isArray(row) && row.length > 0) {
              allText += row.filter(cell => cell !== null && cell !== undefined).join('\t') + '\n'
            }
          })
        })
        
        extractedText = allText
      } else if (fileType === 'text/plain' || fileType === 'text/csv') {
        // Extract text from plain text files
        extractedText = buffer.toString('utf-8')
      } else if (fileType === 'application/vnd.ms-powerpoint' || 
                 fileType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
        // For PowerPoint files, use Replicate to extract text (Claude can read images)
        // This is a fallback - you might want to use a specialized library for PPT
        extractedText = `PowerPoint file: ${fileName}\n[Content extraction pending - please use specialized tools for PowerPoint files]`
      } else {
        throw new Error(`Unsupported file type: ${fileType}`)
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
