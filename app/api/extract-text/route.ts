import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

// Helper function to check if file type is supported by Dolphin model
function isDolphinSupportedFormat(fileType: string): boolean {
  const supportedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/tiff',
    'image/webp'
  ]
  return supportedTypes.includes(fileType)
}

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
        console.log('📄 Processing document with multiple extraction methods...')
        
        // Try multiple extraction approaches for better reliability
        let extractionSuccessful = false
        
        // Debug mode: Skip API calls and use mock extraction for testing
        if (process.env.NODE_ENV === 'development' && process.env.DEBUG_MODE === 'true') {
          console.log('🧪 DEBUG MODE: Using mock text extraction')
          extractedText = `Document: ${fileName}

This is mock extracted text for debugging purposes.

File Type: ${fileType}
File Size: ${fileSizeKB}KB

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Mock content continues here to simulate a real document with multiple paragraphs and information that would typically be extracted from a PDF or other document format.

This allows testing the project creation flow without relying on external APIs.`
          extractionSuccessful = true
          console.log(`✅ Mock extraction complete: ${extractedText.length} characters`)
        }
        
        // Method 1: Try Dolphin model for supported formats
        else if (isDolphinSupportedFormat(fileType) && process.env.REPLICATE_API_TOKEN) {
          try {
            console.log('🐬 Attempting Dolphin model extraction...')
            
            const input = {
              file: fileUrl,
              output_format: "markdown_content"
            }

            // Shorter timeout for faster fallback
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Dolphin timeout after 2 minutes')), 2 * 60 * 1000)
            })
            
            const replicatePromise = replicate.run(
              "bytedance/dolphin:19f1ad93970c2bf21442a842d01d97fb04a94a69d2b36dee43531a9cbae07e85", 
              { input }
            )
            
            const output = await Promise.race([replicatePromise, timeoutPromise])
            
            if (typeof output === 'string' && output.trim().length > 10) {
              extractedText = output.trim()
              extractionSuccessful = true
              console.log(`✅ Dolphin extraction successful: ${extractedText.length} characters`)
            } else if (Array.isArray(output)) {
              const joined = output.join('').trim()
              if (joined.length > 10) {
                extractedText = joined
                extractionSuccessful = true
                console.log(`✅ Dolphin extraction successful (array): ${extractedText.length} characters`)
              }
            }
          } catch (dolphinError) {
            console.error('❌ Dolphin extraction failed, trying fallback methods:', dolphinError)
          }
        }
        
        // Method 2: Try Claude as fallback for complex documents
        if (!extractionSuccessful && process.env.REPLICATE_API_TOKEN) {
          try {
            console.log('🤖 Attempting Claude extraction as fallback...')
            
            // Convert to base64 for Claude
            const base64File = Buffer.from(fileBuffer).toString('base64')
            const dataUrl = `data:${fileType};base64,${base64File}`
            
            // Limit file size for Claude (smaller limit)
            if (fileBuffer.byteLength <= 20 * 1024 * 1024) { // 20MB limit for Claude
              const input = {
                prompt: `Extract all text from this document. Return only the text content without commentary.`,
                image: dataUrl,
                max_tokens: 8192
              }

              let claudeResponse = ''
              for await (const event of replicate.stream("anthropic/claude-3.5-sonnet", { input })) {
                claudeResponse += event
              }

              if (claudeResponse.trim().length > 10) {
                extractedText = claudeResponse.trim()
                extractionSuccessful = true
                console.log(`✅ Claude extraction successful: ${extractedText.length} characters`)
              }
            } else {
              console.log('⚠️ File too large for Claude fallback')
            }
          } catch (claudeError) {
            console.error('❌ Claude extraction also failed:', claudeError)
          }
        }
        
        // Method 3: Basic file info fallback
        if (!extractionSuccessful) {
          console.log('🔄 Using basic file info fallback')
          extractedText = `Document: ${fileName}

File Type: ${fileType}
File Size: ${fileSizeKB}KB
Upload Date: ${new Date().toISOString()}

This document has been successfully uploaded to your project. While automatic text extraction encountered issues, the file is stored and available for reference. You can:

1. Ask questions about this document in your project chat
2. Reference it by filename in conversations
3. Try re-uploading if the file may be corrupted
4. Use a different file format if possible

The AI assistant will do its best to help with questions about this document based on the filename and context you provide.`
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
