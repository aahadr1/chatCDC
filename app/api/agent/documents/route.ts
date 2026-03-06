import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { processDocument } from '@/lib/documentProcessor'

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('cdc_documents')
      .select('id, name, file_type, file_size, chunk_count, uploaded_at')
      .order('uploaded_at', { ascending: false })

    if (error) {
      console.error('cdc_documents list error:', error)
      return NextResponse.json({ error: 'Failed to list documents' }, { status: 500 })
    }
    return NextResponse.json({ documents: data || [] })
  } catch (err) {
    console.error('GET /api/agent/documents error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(file.type) && !file.name.toLowerCase().match(/\.(pdf|docx|txt|md|csv|json)$/)) {
      return NextResponse.json({ error: 'File type not allowed. Use PDF, DOCX, TXT, MD, CSV, or JSON.' }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const processed = await processDocument(buffer, file.type, file.name, file.size)

    const { data: docRow, error: docError } = await supabase
      .from('cdc_documents')
      .insert({
        name: processed.name,
        file_type: processed.fileType,
        file_size: processed.fileSize,
        content_text: processed.contentText.slice(0, 500000),
        chunk_count: processed.chunks.length,
        uploaded_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (docError || !docRow) {
      console.error('cdc_documents insert error:', docError)
      return NextResponse.json({ error: 'Failed to save document' }, { status: 500 })
    }

    const documentId = docRow.id
    const documentName = processed.name

    if (processed.chunks.length > 0) {
      const chunkRows = processed.chunks.map((chunk) => ({
        document_id: documentId,
        document_name: documentName,
        content: chunk.content,
        chunk_index: chunk.index,
      }))
      const { error: chunksError } = await supabase.from('cdc_chunks').insert(chunkRows)
      if (chunksError) {
        console.error('cdc_chunks insert error:', chunksError)
        await supabase.from('cdc_documents').delete().eq('id', documentId)
        return NextResponse.json({ error: 'Failed to save chunks' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      document: {
        id: documentId,
        name: documentName,
        file_type: processed.fileType,
        file_size: processed.fileSize,
        chunk_count: processed.chunks.length,
        uploaded_at: new Date().toISOString(),
      },
    })
  } catch (err) {
    console.error('POST /api/agent/documents error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Document id required' }, { status: 400 })
    }
    const { error } = await supabase.from('cdc_documents').delete().eq('id', id)
    if (error) {
      console.error('cdc_documents delete error:', error)
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/agent/documents error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
