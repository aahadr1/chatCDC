import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; conversationId: string } }
) {
  try {
    // Verify user authentication
    const { user, error: authError } = await getAuthenticatedUser(request as unknown as Request)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId, conversationId } = params

    if (!projectId || !conversationId) {
      return NextResponse.json({ error: 'Project ID and Conversation ID are required' }, { status: 400 })
    }

    // Verify user owns the project
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 })
    }

    // Verify user owns the conversation
    const { data: conversation, error: conversationError } = await supabaseAdmin
      .from('project_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single()

    if (conversationError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found or access denied' }, { status: 404 })
    }

    // Get messages for the conversation
    const { data: messages, error } = await supabaseAdmin
      .from('project_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching project messages:', error)
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    return NextResponse.json({ messages: messages || [] })

  } catch (error) {
    console.error('Get project messages API error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; conversationId: string } }
) {
  try {
    // Verify user authentication
    const { user, error: authError } = await getAuthenticatedUser(request as unknown as Request)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId, conversationId } = params
    const { content, role } = await request.json()

    if (!projectId || !conversationId) {
      return NextResponse.json({ error: 'Project ID and Conversation ID are required' }, { status: 400 })
    }

    // Validate input
    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 })
    }

    if (!role || !['user', 'assistant'].includes(role)) {
      return NextResponse.json({ error: 'Invalid message role' }, { status: 400 })
    }

    if (content.length > 10000) {
      return NextResponse.json({ error: 'Message content too long' }, { status: 400 })
    }

    // Verify user owns the project
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 })
    }

    // Verify user owns the conversation
    const { data: conversation, error: conversationError } = await supabaseAdmin
      .from('project_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single()

    if (conversationError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found or access denied' }, { status: 404 })
    }

    // Create message
    const { data: message, error } = await supabaseAdmin
      .from('project_messages')
      .insert({
        conversation_id: conversationId,
        project_id: projectId,
        user_id: user.id,
        role,
        content: content.trim()
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating project message:', error)
      return NextResponse.json({ error: 'Failed to create message' }, { status: 500 })
    }

    // Update conversation timestamp
    await supabaseAdmin
      .from('project_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)

    return NextResponse.json({ message })

  } catch (error) {
    console.error('Create project message API error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}
