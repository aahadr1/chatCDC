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

    // Note: Database saving is disabled for testing
    // In production, you would save messages to your database here

    // Create a streaming response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullResponse = ''
          
          for await (const chunk of streamGPT5(chatMessages, {
            verbosity: 'medium',
            reasoning_effort: 'minimal',
            max_completion_tokens: 4000
          })) {
            fullResponse += chunk
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`))
          }

          // Note: Database saving is disabled for testing
          // In production, you would save the assistant response here

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
          controller.close()
        } catch (error) {
          console.error('Streaming error:', error)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Failed to get response' })}\n\n`))
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
