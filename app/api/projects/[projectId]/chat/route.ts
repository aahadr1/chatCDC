import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import Replicate from 'replicate';

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
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

    const { projectId } = params;
    const body = await request.json();
    const { message } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Get project and verify ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, extracted_text, user_id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    if (!project.extracted_text) {
      return NextResponse.json(
        { error: 'Project documents are still being processed' },
        { status: 400 }
      );
    }

    if (!REPLICATE_API_TOKEN) {
      return NextResponse.json(
        { error: 'Replicate API not configured' },
        { status: 500 }
      );
    }

    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });

    // Create context-aware prompt
    const contextPrompt = `You are an AI assistant helping analyze documents for the project "${project.name}". 

Here are the extracted documents:
${project.extracted_text}

User Question: ${message.trim()}

Please provide a helpful response based on the document content above. If the question cannot be answered from the provided documents, please say so clearly.`;

    const input = {
      prompt: contextPrompt,
      max_tokens: 512,
      temperature: 0.7,
      system_prompt: "You are a helpful assistant that analyzes documents and answers questions based on their content. Always base your responses on the provided document text.",
      prompt_template: "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{system_prompt}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n{prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
    };

    // Use the Llama model as specified in the requirements
    const output = await replicate.stream("meta/meta-llama-3-8b-instruct", { input });
    
    let responseText = '';
    for await (const event of output) {
      responseText += event;
    }

    if (!responseText.trim()) {
      throw new Error('Empty response from AI model');
    }

    // Save conversation to database
    const { error: conversationError } = await supabase
      .from('project_conversations')
      .insert({
        project_id: projectId,
        user_message: message.trim(),
        ai_response: responseText.trim(),
        created_at: new Date().toISOString(),
      });

    if (conversationError) {
      console.error('Error saving conversation:', conversationError);
      // Don't fail the request, just log the error
    }

    return NextResponse.json({
      response: responseText.trim(),
      projectName: project.name,
    });

  } catch (error) {
    console.error('Project chat error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to process chat request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
