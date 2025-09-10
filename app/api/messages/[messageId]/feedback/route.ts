import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// PUT /api/messages/[messageId]/feedback - Update message feedback
export async function PUT(
  request: NextRequest,
  { params }: { params: { messageId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { messageId } = params;
    const body = await request.json();
    const { feedback } = body;

    if (feedback && !['up', 'down'].includes(feedback)) {
      return NextResponse.json(
        { error: 'Invalid feedback value' },
        { status: 400 }
      );
    }

    // Verify message belongs to user's conversation
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .select(`
        id,
        conversation_id,
        conversations!inner(user_id)
      `)
      .eq('id', messageId)
      .single();

    if (msgError || !message || message.conversations.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      );
    }

    // Update feedback
    const { data: updatedMessage, error } = await supabase
      .from('messages')
      .update({
        feedback: feedback || null
      })
      .eq('id', messageId)
      .select()
      .single();

    if (error) {
      console.error('Error updating message feedback:', error);
      return NextResponse.json(
        { error: 'Failed to update feedback' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: updatedMessage
    });

  } catch (error) {
    console.error('Message feedback API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
