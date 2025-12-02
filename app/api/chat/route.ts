import { NextRequest, NextResponse } from 'next/server'
import { streamGPT5, ChatMessage } from '@/lib/replicate'
import { supabase } from '@/lib/supabaseClient'

// Fixed UUID for anonymous users
const ANONYMOUS_USER_ID = '00000000-0000-0000-0000-000000000000'

export async function POST(request: NextRequest) {
  try {
    const { 
      messages, 
      conversationId, 
      userId = ANONYMOUS_USER_ID,
      settings = {},
      fileContext = '',
      memoryContext = ''
    } = await request.json()

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 })
    }

    // Check if images are being sent
    const hasImages = settings.imageUrls && settings.imageUrls.length > 0
    
    // Get language setting
    const language = settings.language || 'auto'

    // Build enhanced system prompt with context
    let systemPrompt = `You are ChatCDC, an advanced AI assistant. You are helpful, knowledgeable, and conversational.

Key behaviors:
- Provide clear, accurate, and helpful responses
- Use markdown formatting for better readability
- Format code blocks with language tags
- Be concise but thorough
- If you don't know something, admit it honestly`

    // Add language instruction
    if (language && language !== 'auto') {
      const languageNames: Record<string, string> = {
        'en': 'English',
        'fr': 'French',
        'es': 'Spanish',
        'de': 'German',
        'it': 'Italian',
        'pt': 'Portuguese',
        'nl': 'Dutch',
        'ru': 'Russian',
        'zh': 'Chinese',
        'ja': 'Japanese',
        'ko': 'Korean',
        'ar': 'Arabic',
        'hi': 'Hindi',
        'tr': 'Turkish',
        'pl': 'Polish',
        'uk': 'Ukrainian',
        'vi': 'Vietnamese',
        'th': 'Thai',
        'id': 'Indonesian',
        'sv': 'Swedish',
        'da': 'Danish',
        'fi': 'Finnish',
        'no': 'Norwegian',
        'cs': 'Czech',
        'el': 'Greek',
        'he': 'Hebrew',
        'ro': 'Romanian',
        'hu': 'Hungarian',
        'bg': 'Bulgarian',
      }
      const langName = languageNames[language] || language
      systemPrompt += `

**IMPORTANT LANGUAGE INSTRUCTION:**
You MUST respond ONLY in ${langName}. All your responses, explanations, code comments, and any text output must be written in ${langName}. This is a strict requirement - never respond in any other language unless the user explicitly asks you to translate something.`
    }

    // Add OCR/Vision instructions if images are present
    if (hasImages) {
      systemPrompt += `

**VISION & OCR CAPABILITIES:**
You have vision capabilities and can see images the user has attached. When processing images:
1. ALWAYS perform OCR - read and extract ALL visible text from images
2. Describe the visual content, layout, and any important details
3. For documents/screenshots: transcribe the full text content
4. For photos with text (signs, labels, receipts, etc.): read all text
5. For diagrams/charts: describe the structure and any text/labels
6. If the user asks about document content, provide the extracted text
7. Be thorough - don't skip any visible text`
    }

    // Add memory context if available
    if (memoryContext) {
      systemPrompt += `\n\n${memoryContext}`
    }

    // Add file context if available (contains document text from PDFs, etc.)
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

          // Save assistant message to database (wrapped in try-catch)
          if (conversationId) {
            try {
              await supabase.from('messages').insert({
                conversation_id: conversationId,
                user_id: userId || ANONYMOUS_USER_ID,
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
            } catch (dbError) {
              console.warn('Could not save to database:', dbError)
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
