import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify user authentication
    const { user, error: authError } = await getAuthenticatedUser(request as unknown as Request)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const fileId = params.id

    if (!fileId) {
      return NextResponse.json({ error: 'File ID is required' }, { status: 400 })
    }

    // Get file with user verification
    const { data: file, error } = await supabaseAdmin
      .from('project_documents')
      .select('*')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .single()

    if (error) {
      console.error('Error fetching file:', error)
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Failed to fetch file' }, { status: 500 })
    }

    return NextResponse.json({ file })

  } catch (error) {
    console.error('Get file API error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify user authentication
    const { user, error: authError } = await getAuthenticatedUser(request as unknown as Request)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const fileId = params.id

    if (!fileId) {
      return NextResponse.json({ error: 'File ID is required' }, { status: 400 })
    }

    // Get file info first to get the storage path
    const { data: file, error: fileError } = await supabaseAdmin
      .from('project_documents')
      .select('filename, project_id')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .single()

    if (fileError || !file) {
      console.error('Error fetching file for deletion:', fileError)
      if (fileError?.code === 'PGRST116') {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Failed to fetch file' }, { status: 500 })
    }

    // Delete from storage
    const { error: storageError } = await supabaseAdmin.storage
      .from('project-documents')
      .remove([file.filename])

    if (storageError) {
      console.error('Error deleting file from storage:', storageError)
      // Continue with database deletion even if storage deletion fails
    }

    // Delete from database
    const { error: dbError } = await supabaseAdmin
      .from('project_documents')
      .delete()
      .eq('id', fileId)
      .eq('user_id', user.id)

    if (dbError) {
      console.error('Error deleting file from database:', dbError)
      return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
    }

    // Update project document count
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('document_count')
      .eq('id', file.project_id)
      .eq('user_id', user.id)
      .single()

    if (!projectError && project) {
      await supabaseAdmin
        .from('projects')
        .update({ 
          document_count: Math.max(0, project.document_count - 1),
          updated_at: new Date().toISOString()
        })
        .eq('id', file.project_id)
    }

    return NextResponse.json({ message: 'File deleted successfully' })

  } catch (error) {
    console.error('Delete file API error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}
