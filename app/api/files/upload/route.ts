import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { v4 as uuidv4 } from 'uuid'

// Allowed file types and their MIME types (Dolphin supported formats)
const ALLOWED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
  'image/bmp': ['.bmp'],
  'image/tiff': ['.tiff', '.tif'],
  'image/webp': ['.webp']
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const MAX_FILES_PER_REQUEST = 20

export async function POST(request: NextRequest) {
  try {
    // Verify user authentication
    const { user, error: authError } = await getAuthenticatedUser(request as unknown as Request)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const projectId = formData.get('projectId') as string

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json({ 
        error: `Maximum ${MAX_FILES_PER_REQUEST} files allowed per request` 
      }, { status: 400 })
    }

    // Verify user owns the project
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 })
    }

    const uploadedFiles = []
    const errors = []

    // Process each file
    for (const file of files) {
      try {
        // Validate file
        const validation = validateFile(file)
        if (!validation.valid) {
          errors.push({
            filename: file.name,
            error: validation.error
          })
          continue
        }

        // Generate unique filename
        const fileId = uuidv4()
        const fileExt = getFileExtension(file.name)
        const fileName = `${user.id}/${projectId}/${fileId}.${fileExt}`
        
        // Convert file to buffer
        const fileBuffer = await file.arrayBuffer()

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from('project-documents')
          .upload(fileName, fileBuffer, {
            contentType: file.type,
            upsert: false
          })

        if (uploadError) {
          console.error('Upload error for file:', file.name, uploadError)
          errors.push({
            filename: file.name,
            error: 'Failed to upload file'
          })
          continue
        }

        // Get public URL
        const { data: urlData } = supabaseAdmin.storage
          .from('project-documents')
          .getPublicUrl(fileName)

        // Save document record to database
        const { data: document, error: docError } = await supabaseAdmin
          .from('project_documents')
          .insert({
            project_id: projectId,
            user_id: user.id,
            filename: fileName,
            original_filename: file.name,
            file_type: file.type,
            file_size: file.size,
            file_url: urlData.publicUrl,
            processing_status: 'pending'
          })
          .select()
          .single()

        if (docError) {
          console.error('Database error for file:', file.name, docError)
          errors.push({
            filename: file.name,
            error: 'Failed to save file metadata'
          })
          continue
        }

        uploadedFiles.push({
          id: document.id,
          filename: file.name,
          size: file.size,
          type: file.type,
          url: urlData.publicUrl
        })

      } catch (fileError) {
        console.error('Error processing file:', file.name, fileError)
        errors.push({
          filename: file.name,
          error: 'Failed to process file'
        })
      }
    }

    // Update project document count
    if (uploadedFiles.length > 0) {
      await supabaseAdmin
        .from('projects')
        .update({ 
          document_count: uploadedFiles.length,
          updated_at: new Date().toISOString()
        })
        .eq('id', projectId)
    }

    return NextResponse.json({
      success: true,
      uploadedFiles,
      errors,
      message: `Successfully uploaded ${uploadedFiles.length} files`
    })

  } catch (error) {
    console.error('File upload API error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

function validateFile(file: File): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`
    }
  }

  // Check file type
  if (!ALLOWED_FILE_TYPES[file.type as keyof typeof ALLOWED_FILE_TYPES]) {
    return {
      valid: false,
      error: 'File type not supported. Only PDF and image files are allowed.'
    }
  }

  // Check file extension
  const extension = getFileExtension(file.name)
  const allowedExtensions = Object.values(ALLOWED_FILE_TYPES).flat()
  if (!allowedExtensions.includes(extension)) {
    return {
      valid: false,
      error: 'File extension not supported'
    }
  }

  return { valid: true }
}

function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || ''
}
