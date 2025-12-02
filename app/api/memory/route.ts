import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { v4 as uuidv4 } from 'uuid'

// Get all memories for a user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId') || 'anonymous'

    const { data: memories, error } = await supabase
      .from('user_memories')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching memories:', error)
      return NextResponse.json({ error: 'Failed to fetch memories' }, { status: 500 })
    }

    return NextResponse.json({ memories: memories || [] })

  } catch (error) {
    console.error('Memory GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Create a new memory
export async function POST(request: NextRequest) {
  try {
    const { content, userId = 'anonymous' } = await request.json()

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const { data: memory, error } = await supabase
      .from('user_memories')
      .insert({
        id: uuidv4(),
        user_id: userId,
        content: content.trim(),
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating memory:', error)
      return NextResponse.json({ error: 'Failed to create memory' }, { status: 500 })
    }

    return NextResponse.json({ success: true, memory })

  } catch (error) {
    console.error('Memory POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Delete a memory
export async function DELETE(request: NextRequest) {
  try {
    const { memoryId } = await request.json()

    if (!memoryId) {
      return NextResponse.json({ error: 'Memory ID is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('user_memories')
      .delete()
      .eq('id', memoryId)

    if (error) {
      console.error('Error deleting memory:', error)
      return NextResponse.json({ error: 'Failed to delete memory' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Memory DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

