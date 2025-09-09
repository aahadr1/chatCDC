import { NextRequest, NextResponse } from 'next/server';
import { sendMessageToReplicate } from '@/lib/replicate';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      message, 
      settings, 
      images,
      previousResponseId 
    } = body;

    if (!message && (!images || images.length === 0)) {
      return NextResponse.json(
        { error: 'Message or images are required' },
        { status: 400 }
      );
    }

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

    return NextResponse.json({
      content: response.text,
      responseId: response.response_id,
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
