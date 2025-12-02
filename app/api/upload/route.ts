import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { v4 as uuidv4 } from 'uuid'
import { isAllowedFileType, MAX_FILE_SIZE, MAX_FILES_PER_MESSAGE, formatFileSize } from '@/lib/fileProcessor'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const conversationId = formData.get('conversationId') as string
    const userId = formData.get('userId') as string || 'anonymous'

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    if (files.length > MAX_FILES_PER_MESSAGE) {
      return NextResponse.json({ 
        error: `Maximum ${MAX_FILES_PER_MESSAGE} files allowed per upload` 
      }, { status: 400 })
    }

    const uploadedFiles = []
    const errors = []

    for (const file of files) {
      // Validate file type
      if (!isAllowedFileType(file.type)) {
        errors.push({ file: file.name, error: `File type ${file.type} is not allowed` })
        continue
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        errors.push({ file: file.name, error: `File exceeds ${formatFileSize(MAX_FILE_SIZE)} limit` })
        continue
      }

      try {
        // Generate unique filename
        const fileId = uuidv4()
        const ext = file.name.split('.').pop() || ''
        const filePath = `uploads/${userId}/${fileId}.${ext}`

        // Convert file to buffer
        const fileBuffer = await file.arrayBuffer()

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, fileBuffer, {
            contentType: file.type,
            upsert: false
          })

        if (uploadError) {
          console.error('Upload error:', uploadError)
          errors.push({ file: file.name, error: 'Failed to upload file' })
          continue
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath)

        // Extract text content for text-based files
        let content = null
        if (file.type.startsWith('text/') || file.type === 'application/json') {
          content = await file.text()
        }

        // Save file metadata to database
        const { data: fileData, error: dbError } = await supabase
          .from('uploaded_files')
          .insert({
            id: fileId,
            conversation_id: conversationId,
            user_id: userId,
            file_name: file.name,
            file_path: filePath,
            file_url: urlData.publicUrl,
            file_size: file.size,
            file_type: file.type,
            content: content?.substring(0, 50000), // Store first 50k chars
            created_at: new Date().toISOString()
          })
          .select()
          .single()

        if (dbError) {
          console.error('Database error:', dbError)
          errors.push({ file: file.name, error: 'Failed to save file metadata' })
          continue
        }

        uploadedFiles.push({
          ...fileData,
          content: content // Include content for processing
        })
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error)
        errors.push({ file: file.name, error: 'Failed to process file' })
      }
    }

    return NextResponse.json({
      success: uploadedFiles.length > 0,
      files: uploadedFiles,
      errors: errors.length > 0 ? errors : undefined,
      message: `${uploadedFiles.length} of ${files.length} files uploaded successfully`
    })

  } catch (error) {
    console.error('Upload API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Handle file deletion
export async function DELETE(request: NextRequest) {
  try {
    const { fileId, userId } = await request.json()

    if (!fileId) {
      return NextResponse.json({ error: 'File ID required' }, { status: 400 })
    }

    // Get file info
    const { data: file } = await supabase
      .from('uploaded_files')
      .select('file_path')
      .eq('id', fileId)
      .single()

    if (file?.file_path) {
      // Delete from storage
      await supabase.storage
        .from('documents')
        .remove([file.file_path])
    }

    // Delete from database
    const { error } = await supabase
      .from('uploaded_files')
      .delete()
      .eq('id', fileId)

    if (error) {
      console.error('Delete error:', error)
      return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Delete API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

