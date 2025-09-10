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
            prompt: input.prompt,
            promptLength: input.prompt.length, 
            systemPromptLength: input.system_prompt.length,
            maxTokens: input.max_tokens
          })

          // Try non-streaming first to test basic functionality
          console.log('🚀 Starting Replicate call (non-streaming)...')
          
          try {
            const output = await replicate.run("anthropic/claude-3.5-sonnet", { input })
            console.log('📄 Replicate response:', typeof output, output)
            
            let responseText = ''
            
            if (typeof output === 'string') {
              responseText = output
            } else if (Array.isArray(output)) {
              responseText = output.join('')
            } else if (output && typeof output === 'object') {
              // Try to extract text from various possible structures
              if (output.text) {
                responseText = String(output.text)
              } else if (output.content) {
                responseText = String(output.content)
              } else if (output.response) {
                responseText = String(output.response)
              } else {
                responseText = JSON.stringify(output)
              }
            }
            
            console.log('📄 Extracted response text:', responseText)
            
            if (responseText && responseText.trim()) {
              // Send the response as a single chunk
              const chunk = `data: ${JSON.stringify({ content: responseText.trim() })}\n\n`
              controller.enqueue(new TextEncoder().encode(chunk))
              console.log('✅ Response sent to client')
            } else {
              console.error('❌ No valid response text extracted')
              const errorChunk = `data: ${JSON.stringify({ 
                error: 'No response generated',
                content: 'I apologize, but I couldn\'t generate a response. Please try again.'
              })}\n\n`
              controller.enqueue(new TextEncoder().encode(errorChunk))
            }
            
            console.log('✅ Claude call completed')
            // Send completion signal
            controller.enqueue(new TextEncoder().encode('data: {"done": true}\n\n'))
            controller.close()
            
          } catch (replicateError) {
            console.error('❌ Replicate call error:', replicateError)
            console.error('Error details:', {
              message: replicateError instanceof Error ? replicateError.message : 'Unknown error',
              stack: replicateError instanceof Error ? replicateError.stack : undefined
            })
            
            const errorChunk = `data: ${JSON.stringify({ 
              error: 'Failed to get response from AI model',
              content: 'I apologize, but I encountered an error while processing your request. Please try again.'
            })}\n\n`
            controller.enqueue(new TextEncoder().encode(errorChunk))
            controller.close()
          }

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
