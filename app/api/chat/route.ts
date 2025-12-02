import { NextRequest, NextResponse } from 'next/server'
import { streamGPT5, ChatMessage } from '@/lib/replicate'
import { supabase } from '@/lib/supabaseClient'

export async function POST(request: NextRequest) {
  try {
    const { 
      messages, 
      conversationId, 
      userId = 'anonymous',
      settings = {},
      fileContext = '',
      memoryContext = ''
    } = await request.json()

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 })
    }

    // Build enhanced system prompt with context
    let systemPrompt = `You are ChatCDC, an advanced AI assistant. You are helpful, knowledgeable, and conversational.

Key behaviors:
- Provide clear, accurate, and helpful responses
- Use markdown formatting for better readability
- Format code blocks with language tags
- Be concise but thorough
- If you don't know something, admit it honestly`

    // Add memory context if available
    if (memoryContext) {
      systemPrompt += `\n\n${memoryContext}`
    }

    // Add file context if available
    if (fileContext) {
      systemPrompt += `\n\n${fileContext}`
    }

    // Convert messages to the format expected by GPT-5
    const chatMessages: ChatMessage[] = messages.map((msg: any) => ({
      role: msg.role,
      content: msg.content
    }))

    // Create a streaming response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullResponse = ''
          
          // Stream from GPT-5
          for await (const chunk of streamGPT5(chatMessages, {
            verbosity: settings.verbosity || 'medium',
            reasoning_effort: settings.reasoningEffort || 'medium',
            max_completion_tokens: settings.maxTokens || 4000,
            system_prompt: systemPrompt,
            // Add image inputs if any images were uploaded
            ...(settings.imageUrls && { image_input: settings.imageUrls })
          })) {
            fullResponse += chunk
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`))
          }

          // Save assistant message to database
          if (conversationId) {
            await supabase.from('messages').insert({
              conversation_id: conversationId,
              user_id: userId,
              role: 'assistant',
              content: fullResponse,
              created_at: new Date().toISOString()
            })

            // Update conversation title if this is the first response
            const { data: conv } = await supabase
              .from('conversations')
              .select('title')
              .eq('id', conversationId)
              .single()

            if (conv?.title === 'New Chat' && messages.length > 0) {
              const firstUserMessage = messages.find((m: any) => m.role === 'user')?.content || ''
              const newTitle = firstUserMessage.substring(0, 50) + (firstUserMessage.length > 50 ? '...' : '')
              
              await supabase
                .from('conversations')
                .update({ title: newTitle, updated_at: new Date().toISOString() })
                .eq('id', conversationId)
            }
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
          controller.close()
        } catch (error) {
          console.error('Streaming error:', error)
          
          const errorMessage = error instanceof Error 
            ? error.message 
            : 'An unexpected error occurred'
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            error: errorMessage,
            content: 'I apologize, but I encountered an error processing your request. Please try again.'
          })}\n\n`))
          
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
