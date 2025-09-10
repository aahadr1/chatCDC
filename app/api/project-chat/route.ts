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

          // Stream response from Replicate with proper SSE parsing
          const replicateStream = replicate.stream("anthropic/claude-3.5-sonnet", { input })
          
          for await (const chunk of replicateStream) {
            console.log('📄 Raw chunk from Replicate:', chunk)
            
            // Parse the SSE chunk properly
            const chunkStr = String(chunk)
            const lines = chunkStr.split('\n')
            
            for (const line of lines) {
              const trimmedLine = line.trim()
              
              // Handle SSE format: {"event":"output","data":"content","id":"..."}
              if (trimmedLine.startsWith('{') && trimmedLine.includes('"event"')) {
                try {
                  const sseEvent = JSON.parse(trimmedLine)
                  console.log('📄 Parsed SSE event:', sseEvent)
                  
                  // Only process "output" events with actual data
                  if (sseEvent.event === 'output' && sseEvent.data && sseEvent.data.trim()) {
                    const content = sseEvent.data.trim()
                    console.log('📄 Extracted content:', content)
                    
                    const chunk = `data: ${JSON.stringify({ content })}\n\n`
                    controller.enqueue(new TextEncoder().encode(chunk))
                  }
                  // Stop on "done" event
                  else if (sseEvent.event === 'done') {
                    console.log('🏁 Received done event from Replicate')
                    break
                  }
                  // Handle errors
                  else if (sseEvent.event === 'error') {
                    console.error('❌ Error from Replicate:', sseEvent.data)
                    throw new Error(sseEvent.data || 'Unknown error from Replicate')
                  }
                } catch (e) {
                  console.warn('⚠️ Failed to parse SSE event:', trimmedLine, e)
                }
              }
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
