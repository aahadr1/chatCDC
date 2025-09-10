import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

export async function POST(request: NextRequest) {
  try {
    // Get the authenticated user from the authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { messages, projectId, conversationId, userId, knowledgeBase } = body

    if (!messages || !projectId || !conversationId || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify user owns the project
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('name, description')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 })
    }

    // Create enhanced system prompt with knowledge base
    const systemPrompt = `You are an AI assistant with access to a specific project's documents. You have been given a knowledge base containing the full text of all documents in the project "${project.name}".

${project.description ? `Project Description: ${project.description}` : ''}

KNOWLEDGE BASE:
${knowledgeBase || 'No documents have been processed yet.'}

END OF KNOWLEDGE BASE

Instructions:
1. Answer questions based ONLY on the information provided in the knowledge base above
2. If a question cannot be answered from the knowledge base, clearly state that the information is not available in the provided documents
3. When citing information, try to indicate which document it comes from if possible
4. Be helpful, accurate, and comprehensive in your responses
5. If asked about the project or documents, provide relevant details from the knowledge base
6. Feel free to make connections between different pieces of information from various documents
7. If the user asks for summaries or analysis, provide detailed responses based on the available content

Remember: Your knowledge is limited to the documents in this project's knowledge base. Do not use external knowledge unless specifically requested and clearly distinguished from the document-based information.`

    // Prepare messages for the API
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ]

    // Create a ReadableStream for server-sent events
    const stream = new ReadableStream({
      async start(controller) {
        try {
          console.log('🚀 Starting project chat stream')
          
          // Get the last user message
          const lastMessage = messages[messages.length - 1]
          if (!lastMessage || lastMessage.role !== 'user') {
            throw new Error('No user message found')
          }

          const input = {
            prompt: lastMessage.content,
            system_prompt: systemPrompt,
            max_tokens: 8192,
            max_image_resolution: 0.5
          }

          console.log('📝 Sending to Claude with input:', { 
            promptLength: input.prompt.length, 
            systemPromptLength: input.system_prompt.length 
          })

          // Stream response from Replicate
          for await (const event of replicate.stream("anthropic/claude-3.5-sonnet", { input })) {
            console.log('📄 Received chunk from Claude:', typeof event, event)
            
            // Extract actual content from Replicate's SSE stream
            let content: string = ''
            
            if (typeof event === 'string') {
              // If it's a string, it might be the actual content
              content = event
            } else if (event && typeof event === 'object') {
              const eventObj = event as any
              
              // Check for different possible content structures
              if (eventObj.data) {
                // Handle SSE data field
                if (typeof eventObj.data === 'string') {
                  content = eventObj.data
                } else if (eventObj.data.content) {
                  content = String(eventObj.data.content)
                } else if (eventObj.data.text) {
                  content = String(eventObj.data.text)
                }
              } else if (eventObj.content) {
                content = String(eventObj.content)
              } else if (eventObj.text) {
                content = String(eventObj.text)
              } else if (eventObj.choices && eventObj.choices[0] && eventObj.choices[0].delta) {
                // Handle OpenAI-style response
                content = String(eventObj.choices[0].delta.content || '')
              } else {
                // Fallback: try to extract any text content
                content = JSON.stringify(event)
              }
            }
            
            // Only send non-empty content
            if (content && content.trim()) {
              const chunk = `data: ${JSON.stringify({ content: content.trim() })}\n\n`
              controller.enqueue(new TextEncoder().encode(chunk))
            }
          }

          console.log('✅ Claude stream completed')
          // Send completion signal
          controller.enqueue(new TextEncoder().encode('data: {"done": true}\n\n'))
          controller.close()

        } catch (error) {
          console.error('❌ Error in project chat stream:', error)
          console.error('Error details:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
          })
          
          const errorChunk = `data: ${JSON.stringify({ 
            error: 'An error occurred while processing your request',
            content: 'I apologize, but I encountered an error while processing your request. Please try again.'
          })}\n\n`
          controller.enqueue(new TextEncoder().encode(errorChunk))
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
    console.error('Project chat API error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
