import { NextRequest, NextResponse } from 'next/server'
import { streamGPT5, ChatMessage } from '@/lib/replicate'

export async function POST(request: NextRequest) {
  try {
    const { messages, conversationId, userId = 'anonymous' } = await request.json()

    console.log('API received messages:', messages)
    console.log('Last message content:', messages[messages.length - 1]?.content)

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 })
    }

    // Convert messages to the format expected by GPT-5
    const chatMessages: ChatMessage[] = messages.map((msg: any) => ({
      role: msg.role,
      content: msg.content
    }))

    console.log('Converted chat messages:', chatMessages)

    // Create a streaming response with advanced configuration
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullResponse = ''
          
          // Advanced GPT-5 configuration with reasoning and verbosity controls
          for await (const chunk of streamGPT5(chatMessages, {
            verbosity: 'medium',
            reasoning_effort: 'medium',
            max_completion_tokens: 4000,
            system_prompt: 
              'You are an advanced AI assistant in a chat application. ' +
              'Provide clear, concise, and helpful responses. ' +
              'Adapt your communication style to the user\'s needs.'
          })) {
            fullResponse += chunk
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`))
          }

          // Final message indicating stream completion
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
          controller.close()
        } catch (error) {
          console.error('Streaming error:', error)
          
          // Detailed error response
          const errorMessage = error instanceof Error 
            ? error.message 
            : 'An unexpected error occurred during AI response generation'
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            error: errorMessage,
            details: error instanceof Error ? {
              name: error.name,
              message: error.message,
              stack: error.stack
            } : null
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
    
    // Comprehensive error handling
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : null
    }, { status: 500 })
  }
}
