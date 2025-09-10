import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const conversationId = formData.get('conversationId') as string
    const userId = formData.get('userId') as string || 'anonymous'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })
    }

    // Generate unique filename
    const fileId = uuidv4()
    const fileName = `${fileId}.pdf`
    const filePath = `pdfs/${userId}/${fileName}`

    // Convert file to buffer
    const fileBuffer = await file.arrayBuffer()

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, fileBuffer, {
        contentType: 'application/pdf',
        upsert: false
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath)

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
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json({ error: 'Failed to save file metadata' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      file: fileData,
      url: urlData.publicUrl
    })
  } catch (error) {
    console.error('Upload API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
