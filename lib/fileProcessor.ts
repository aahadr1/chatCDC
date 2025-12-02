import { supabase } from './supabaseClient'

export interface ProcessedFile {
  id: string
  file_name: string
  file_url: string
  file_size: number
  file_type: string
  content?: string
  preview?: string
  summary?: string
}

export const ALLOWED_FILE_TYPES = {
  // Documents
  'application/pdf': { ext: '.pdf', category: 'document' },
  'text/plain': { ext: '.txt', category: 'document' },
  'text/markdown': { ext: '.md', category: 'document' },
  'text/csv': { ext: '.csv', category: 'data' },
  
  // Images
  'image/jpeg': { ext: '.jpg', category: 'image' },
  'image/png': { ext: '.png', category: 'image' },
  'image/gif': { ext: '.gif', category: 'image' },
  'image/webp': { ext: '.webp', category: 'image' },
  
  // Code
  'application/json': { ext: '.json', category: 'code' },
  'text/javascript': { ext: '.js', category: 'code' },
  'application/x-javascript': { ext: '.js', category: 'code' },
}

export const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB
export const MAX_FILES_PER_MESSAGE = 10

export function isAllowedFileType(mimeType: string): boolean {
  return mimeType in ALLOWED_FILE_TYPES || 
    mimeType.startsWith('image/') || 
    mimeType.startsWith('text/')
}

export function getFileCategory(mimeType: string): 'document' | 'image' | 'data' | 'code' | 'other' {
  const config = ALLOWED_FILE_TYPES[mimeType as keyof typeof ALLOWED_FILE_TYPES]
  if (config) return config.category as any
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('text/')) return 'document'
  return 'other'
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export async function uploadFile(
  file: File,
  conversationId: string,
  userId: string
): Promise<ProcessedFile | null> {
  try {
    // Validate file
    if (!isAllowedFileType(file.type)) {
      throw new Error(`File type ${file.type} is not allowed`)
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds ${formatFileSize(MAX_FILE_SIZE)} limit`)
    }

    // Generate unique ID and path
    const fileId = crypto.randomUUID()
    const ext = file.name.split('.').pop() || ''
    const filePath = `uploads/${userId}/${fileId}.${ext}`

    // Convert to buffer
    const fileBuffer = await file.arrayBuffer()

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      throw new Error('Failed to upload file')
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath)

    // Save file metadata
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
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      throw new Error('Failed to save file metadata')
    }

    return {
      id: fileId,
      file_name: file.name,
      file_url: urlData.publicUrl,
      file_size: file.size,
      file_type: file.type,
    }
  } catch (error) {
    console.error('File upload error:', error)
    return null
  }
}

export async function processFileContent(file: File): Promise<string | null> {
  const category = getFileCategory(file.type)

  try {
    switch (category) {
      case 'document':
        if (file.type === 'application/pdf') {
          // PDF processing would happen on the server
          return null
        }
        // For text files, read directly
        return await file.text()

      case 'data':
        // CSV and JSON files
        return await file.text()

      case 'code':
        return await file.text()

      case 'image':
        // Images are handled separately via vision models
        return null

      default:
        return null
    }
  } catch (error) {
    console.error('Error processing file content:', error)
    return null
  }
}

export function createFilePreview(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(null)
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      resolve(e.target?.result as string)
    }
    reader.onerror = () => {
      resolve(null)
    }
    reader.readAsDataURL(file)
  })
}

// Build file context for AI
export function buildFileContext(files: ProcessedFile[]): string {
  if (files.length === 0) return ''

  const textFiles = files.filter(f => !f.file_type.startsWith('image/'))
  const imageFiles = files.filter(f => f.file_type.startsWith('image/'))
  
  let context = '\n---\n## USER ATTACHED FILES\n'
  context += 'The user has attached the following files to their message. Please analyze and respond based on these files:\n'
  
  // Handle text/document files
  textFiles.forEach((file, i) => {
    context += `\n### Document ${i + 1}: "${file.file_name}"\n`
    context += `Type: ${file.file_type} | Size: ${formatFileSize(file.file_size)}\n`
    
    if (file.content) {
      const truncatedContent = file.content.length > 10000 
        ? file.content.substring(0, 10000) + '\n\n[... content truncated for length ...]'
        : file.content
      context += `\n**File Contents:**\n\`\`\`\n${truncatedContent}\n\`\`\`\n`
    } else {
      context += `\n(File content could not be extracted - this may be a binary file like PDF)\n`
    }
    
    if (file.summary) {
      context += `\n**Summary:** ${file.summary}\n`
    }
  })
  
  // Handle image files
  if (imageFiles.length > 0) {
    context += `\n### Images Attached (${imageFiles.length}):\n`
    imageFiles.forEach((file, i) => {
      context += `- Image ${i + 1}: "${file.file_name}" (${file.file_type})\n`
    })
    context += `\nNote: These images have been sent to the vision model for analysis. Please describe what you see in the images if relevant to the user's question.\n`
  }
  
  context += '\n---\n'
  
  return context
}

