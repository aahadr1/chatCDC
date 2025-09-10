import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json()

    // Check if API token is configured
    if (!process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_TOKEN === 'your_replicate_api_token_here') {
      return NextResponse.json({ 
        error: 'Replicate API token not configured. Please add your token to .env.local' 
      }, { status: 500 })
    }

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 })
    }

    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    })

    // Create a streaming response
    const encoder = new TextEncoder()
    const normalizeToText = (chunk: any): string => {
      if (chunk == null) return ''
      // If it's a JSON string like {"event":"output","data":"Hi"}, extract the data
      if (typeof chunk === 'string') {
        const trimmed = chunk.trim()
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          try {
            const obj = JSON.parse(trimmed)
            // Replicate event format
            if (obj && typeof obj === 'object' && 'event' in obj) {
              if (obj.event === 'output' && typeof obj.data === 'string') return obj.data
              // ignore done/null/other events
              return ''
            }
            // If it parsed but isn't an event, stringify fallback
            if (typeof obj?.content === 'string') return obj.content
            if (typeof obj?.text === 'string') return obj.text
            if (typeof obj?.output === 'string') return obj.output
            return ''
          } catch {
            // Not JSON, treat as plain text
            return chunk
          }
        }
        return chunk
      }
      if (typeof chunk === 'object') {
        // Structured Replicate event
        if (typeof (chunk as any).event === 'string') {
          if ((chunk as any).event === 'output' && typeof (chunk as any).data === 'string') return (chunk as any).data
          return ''
        }
        if (typeof (chunk as any).content === 'string') return (chunk as any).content
        if (typeof (chunk as any).text === 'string') return (chunk as any).text
        if (typeof (chunk as any).output === 'string') return (chunk as any).output
        try { return JSON.stringify(chunk) } catch { return String(chunk) }
      }
      return String(chunk)
    }
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Use GPT-5 with proper message format
          const input = {
            messages: messages.map((msg: Message) => ({
              role: msg.role,
              content: msg.content
            })),
            system_prompt: "You are a helpful, harmless, and honest AI assistant. Provide clear, concise, and accurate responses.",
            verbosity: "medium",
            reasoning_effort: "medium",
            max_completion_tokens: 4000
          }

          console.log('Sending to GPT-5:', input)

          const stream = await replicate.stream("openai/gpt-5", { input })

          for await (const event of stream) {
            const text = normalizeToText(event)
            if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`))
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
          controller.close()
        } catch (error) {
          console.error('GPT-5 Streaming error:', error)
          
          // Fallback to Llama 2 if GPT-5 fails
          try {
            console.log('Falling back to Llama 2...')
            
            const prompt = messages
              .map((msg: Message) => `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`)
              .join('\n\n') + '\n\nAssistant: '

            const fallbackStream = await replicate.stream("meta/llama-2-70b-chat", {
              input: {
                prompt: prompt,
                max_new_tokens: 1000,
                temperature: 0.7,
                system_prompt: "You are a helpful AI assistant."
              }
            })

            for await (const event of fallbackStream) {
              const text = normalizeToText(event)
              if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`))
            }

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
            controller.close()
          } catch (fallbackError) {
            console.error('Fallback model also failed:', fallbackError)
            
            // Send error in stream format
            const errorMessage = error instanceof Error ? error.message : 'An error occurred'
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              content: `Sorry, I encountered an error: ${errorMessage}. Please check your API token and try again.`
            })}\n\n`))
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
            controller.close()
          }
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
