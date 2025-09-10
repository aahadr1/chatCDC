import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { sendMessageToReplicate } from '@/lib/replicate';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { 
      message, 
      settings, 
      images,
      conversationId,
      previousResponseId 
    } = body;

    if (!message && (!images || images.length === 0)) {
      return NextResponse.json(
        { error: 'Message or images are required' },
        { status: 400 }
      );
    }

    let conversation;

    // If conversationId provided, verify it belongs to user
    if (conversationId) {
      const { data: existingConv, error: convError } = await supabase
        .from('conversations')
        .select('id, title')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .single();

      if (convError || !existingConv) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        );
      }
      conversation = existingConv;
    } else {
      // Create new conversation
      const title = message.length > 50 ? message.substring(0, 47) + '...' : message;
      const { data: newConv, error: createError } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          title
        })
        .select()
        .single();

      if (createError) {
        return NextResponse.json(
          { error: 'Failed to create conversation' },
          { status: 500 }
        );
      }
      conversation = newConv;
    }

    // Save user message to database
    const { data: userMessage, error: userMsgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        role: 'user',
        content: message,
        images: images || null
      })
      .select()
      .single();

    if (userMsgError) {
      console.error('Error saving user message:', userMsgError);
      return NextResponse.json(
        { error: 'Failed to save message' },
        { status: 500 }
      );
    }

    // Send to AI
    const replicateRequest = {
      model: settings.model || 'gpt-5',
      prompt: message,
      image_input: images || [],
      reasoning_effort: settings.reasoningEffort || 'minimal',
      verbosity: settings.verbosity || 'medium',
      enable_web_search: settings.enableWebSearch || false,
      max_output_tokens: settings.maxTokens,
      // Only forward valid response IDs (must start with 'resp_')
      previous_response_id: typeof previousResponseId === 'string' && previousResponseId.startsWith('resp_')
        ? previousResponseId
        : undefined,
    };

    const response = await sendMessageToReplicate(replicateRequest);

    // Save AI response to database
    const { data: aiMessage, error: aiMsgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        role: 'assistant',
        content: response.text
      })
      .select()
      .single();

    if (aiMsgError) {
      console.error('Error saving AI message:', aiMsgError);
      return NextResponse.json(
        { error: 'Failed to save AI response' },
        { status: 500 }
      );
    }

    // Update conversation timestamp
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversation.id);

    return NextResponse.json({
      content: response.text,
      responseId: response.response_id,
      conversationId: conversation.id,
      userMessage,
      aiMessage
    });

  } catch (error) {
    console.error('Chat API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to process chat request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
