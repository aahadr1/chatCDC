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
      } else if (isDolphinSupportedFormat(fileType)) {
        console.log('🐬 Using Dolphin model for document parsing')
        
        // Check if Replicate token is available
        if (!process.env.REPLICATE_API_TOKEN) {
          console.error('❌ REPLICATE_API_TOKEN not configured')
          throw new Error('Text extraction service not configured')
        }

        // Check file size (reasonable limit for document processing)
        const maxSizeBytes = 50 * 1024 * 1024 // 50MB limit
        if (fileBuffer.byteLength > maxSizeBytes) {
          console.error(`❌ File too large: ${fileSizeKB}KB (max 50MB)`)
          throw new Error(`File too large: ${fileSizeKB}KB. Maximum file size is 50MB.`)
        }

        try {
          console.log('🚀 Using Dolphin model for document parsing...')
          
          // Dolphin model works directly with file URLs, no need for base64 conversion
          const input = {
            file: fileUrl,
            output_format: "markdown_content" // Get structured markdown output
          }

          console.log('📡 Calling Dolphin API with input:', { file: fileUrl, output_format: input.output_format })
          
          // Add timeout and retry logic
          const maxRetries = 2
          let lastError: Error | null = null
          let output: any = null
          
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              console.log(`🔄 Attempt ${attempt}/${maxRetries}`)
              
              // Set a reasonable timeout for document processing
              const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Request timeout after 5 minutes')), 5 * 60 * 1000)
              })
              
              const replicatePromise = replicate.run(
                "bytedance/dolphin:19f1ad93970c2bf21442a842d01d97fb04a94a69d2b36dee43531a9cbae07e85", 
                { input }
              )
              
              output = await Promise.race([replicatePromise, timeoutPromise])
              
              console.log('📄 Dolphin response received successfully')
              break // Success, exit retry loop
              
            } catch (attemptError) {
              console.error(`❌ Attempt ${attempt} failed:`, attemptError)
              lastError = attemptError instanceof Error ? attemptError : new Error('Unknown error')
              
              if (attempt === maxRetries) {
                throw lastError
              }
              
              // Wait before retry (exponential backoff)
              const waitTime = Math.pow(2, attempt) * 1000 // 2s, 4s, 8s...
              console.log(`⏳ Waiting ${waitTime}ms before retry...`)
              await new Promise(resolve => setTimeout(resolve, waitTime))
            }
          }

          if (!output) {
            throw new Error('Failed to get response from Dolphin model after retries')
          }

          console.log('📄 Dolphin response type:', typeof output)
          
          // Handle different response formats
          if (typeof output === 'string') {
            extractedText = output.trim()
          } else if (Array.isArray(output)) {
            extractedText = output.join('').trim()
          } else if (output && typeof output === 'object') {
            // If it's an object, try to extract text content
            extractedText = JSON.stringify(output, null, 2)
          } else {
            throw new Error('Unexpected response format from Dolphin model')
          }

          console.log(`✅ Dolphin extraction complete: ${extractedText.length} characters`)
          
          // Clean up the extracted text
          if (extractedText.length > 0) {
            // Remove excessive whitespace but preserve structure
            extractedText = extractedText
              .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove triple+ line breaks
              .replace(/[ \t]+/g, ' ') // Replace multiple spaces/tabs with single space
              .trim()
          }
          
        } catch (dolphinError) {
          console.error('❌ Dolphin extraction failed:', dolphinError)
          console.error('Error details:', {
            message: dolphinError instanceof Error ? dolphinError.message : 'Unknown error',
            stack: dolphinError instanceof Error ? dolphinError.stack : undefined
          })
          
          // Fallback: create a placeholder with file info
          extractedText = `Document: ${fileName}\n\nFile type: ${fileType}\nFile size: ${fileSizeKB}KB\n\n[This document was uploaded but text extraction temporarily failed. The file has been saved and you can ask questions about it, though responses may be limited.]`
          console.log('🔄 Using fallback text extraction')
        }
      } else {
        // Unsupported file type
        console.log(`⚠️ Unsupported file type: ${fileType}`)
        extractedText = `Document: ${fileName}\n\nFile type: ${fileType} (unsupported)\nFile size: ${fileSizeKB}KB\n\n[This file type is not currently supported for automatic text extraction. The file has been saved and you can reference it in conversations, but text content is not available.]`
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
