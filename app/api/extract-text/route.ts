import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

export async function POST(request: NextRequest) {
  try {
    console.log('📝 Extract text API called')
    
    // Get the authenticated user from the authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('❌ No authorization header')
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !user) {
      console.error('❌ Authentication failed:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('✅ User authenticated:', user.id)

    const body = await request.json()
    const { documentId, projectId, fileUrl, fileName, fileType } = body

    console.log('📄 Processing file:', { fileName, fileType, documentId })

    if (!documentId || !projectId || !fileUrl || !fileName || !fileType) {
      console.error('❌ Missing required fields')
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Update document status to processing
    await supabaseAdmin
      .from('project_documents')
      .update({ processing_status: 'processing' })
      .eq('id', documentId)

    let extractedText = ''

    try {
      console.log('🔄 Starting text extraction process')
      
      // Download the file
      console.log('📥 Downloading file from:', fileUrl)
      const fileResponse = await fetch(fileUrl)
      if (!fileResponse.ok) {
        throw new Error(`Failed to download file: ${fileResponse.status} ${fileResponse.statusText}`)
      }

      const fileBuffer = await fileResponse.arrayBuffer()
      const fileSizeKB = Math.round(fileBuffer.byteLength / 1024)
      console.log(`📁 File downloaded successfully: ${fileSizeKB}KB`)

      // For text files, extract directly
      if (fileType === 'text/plain' || fileType === 'text/csv') {
        console.log('📝 Processing as text file')
        extractedText = Buffer.from(fileBuffer).toString('utf-8')
        console.log(`✅ Direct text extraction complete: ${extractedText.length} characters`)
      } else {
        console.log('🤖 Using Claude for text extraction')
        
        // Check if Replicate token is available
        if (!process.env.REPLICATE_API_TOKEN) {
          console.error('❌ REPLICATE_API_TOKEN not configured')
          throw new Error('Text extraction service not configured')
        }

        // Check file size (Replicate has limits)
        const maxSizeBytes = 20 * 1024 * 1024 // 20MB limit for Replicate
        if (fileBuffer.byteLength > maxSizeBytes) {
          console.error(`❌ File too large: ${fileSizeKB}KB (max 20MB)`)
          throw new Error(`File too large: ${fileSizeKB}KB. Maximum file size is 20MB.`)
        }

        // Convert buffer to base64 for Claude
        console.log('🔄 Converting file to base64...')
        const base64File = Buffer.from(fileBuffer).toString('base64')
        const dataUrl = `data:${fileType};base64,${base64File}`
        console.log(`📤 Base64 conversion complete: ${Math.round(base64File.length / 1024)}KB`)

        // Use Claude to extract text from other document types
        try {
          console.log('🚀 Calling Replicate API...')
          const input = {
            prompt: `Please extract all the text content from this document. Return only the extracted text without any additional commentary or formatting. If this is a structured document (like a spreadsheet or table), preserve the structure using tabs and line breaks.`,
            image: dataUrl,
            max_tokens: 8192
          }

          let claudeResponse = ''
          let eventCount = 0
          
          for await (const event of replicate.stream("anthropic/claude-3.5-sonnet", { input })) {
            claudeResponse += event
            eventCount++
            if (eventCount % 10 === 0) {
              console.log(`📡 Received ${eventCount} events from Claude, current length: ${claudeResponse.length}`)
            }
          }

          extractedText = claudeResponse.trim()
          console.log(`✅ Claude extraction complete: ${extractedText.length} characters`)
          
        } catch (claudeError) {
          console.error('❌ Claude extraction failed:', claudeError)
          console.error('Error details:', {
            message: claudeError instanceof Error ? claudeError.message : 'Unknown error',
            stack: claudeError instanceof Error ? claudeError.stack : undefined
          })
          
          // Fallback: create a placeholder with file info
          extractedText = `Document: ${fileName}\n\nFile type: ${fileType}\nFile size: ${fileSizeKB}KB\n\n[This document was uploaded but text extraction temporarily failed. The file has been saved and you can ask questions about it, though responses may be limited.]`
          console.log('🔄 Using fallback text extraction')
        }
      }

      // Clean up the extracted text
      extractedText = extractedText.replace(/\s+/g, ' ').trim()

      if (!extractedText || extractedText.length < 10) {
        // Final fallback - create a basic file record
        const fileSizeKB = Math.round(fileBuffer.byteLength / 1024)
        extractedText = `Document: ${fileName}\n\nFile type: ${fileType}\nFile size: ${fileSizeKB}KB\n\n[File uploaded successfully but text content could not be extracted automatically. You can still reference this file in conversations.]`
        console.log('🔄 Using final fallback text')
      }

      console.log(`💾 Saving extracted text: ${extractedText.length} characters`)
      
      // Update the document with extracted text
      const { error: updateError } = await supabaseAdmin
        .from('project_documents')
        .update({
          extracted_text: extractedText,
          text_length: extractedText.length,
          processing_status: 'completed'
        })
        .eq('id', documentId)

      if (updateError) {
        console.error('❌ Failed to update document:', updateError)
        throw new Error(`Failed to save extracted text: ${updateError.message}`)
      }

      console.log('✅ Document updated successfully')

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
      console.error('❌ Text extraction error:', extractionError)
      console.error('Full error details:', {
        message: extractionError instanceof Error ? extractionError.message : 'Unknown error',
        stack: extractionError instanceof Error ? extractionError.stack : undefined,
        name: extractionError instanceof Error ? extractionError.name : undefined
      })
      
      // Update document status to failed
      const { error: failUpdateError } = await supabaseAdmin
        .from('project_documents')
        .update({
          processing_status: 'failed',
          processing_error: extractionError instanceof Error ? extractionError.message : 'Unknown error'
        })
        .eq('id', documentId)

      if (failUpdateError) {
        console.error('❌ Failed to update document status to failed:', failUpdateError)
      }

      return NextResponse.json({
        error: 'Text extraction failed',
        details: extractionError instanceof Error ? extractionError.message : 'Unknown error'
      }, { status: 500 })
    }

  } catch (error) {
    console.error('❌ Extract text API error:', error)
    console.error('Full API error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    })
    
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
