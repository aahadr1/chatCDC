import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

// Type for Replicate model identifiers
type ReplicateModelId = `${string}/${string}` | `${string}/${string}:${string}`

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface GPT5Response {
  text: string
  reasoning?: string
}

export interface GPT5StreamOptions {
  /** Control model's reasoning depth */
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high'
  
  /** Control response verbosity */
  verbosity?: 'low' | 'medium' | 'high'
  
  /** Maximum tokens for response generation */
  max_completion_tokens?: number
  
  /** Custom system prompt to guide model behavior */
  system_prompt?: string
  
  /** Optional image inputs for multimodal tasks */
  image_input?: string[]
}

interface ModelConfig {
  name: ReplicateModelId
  input: Record<string, unknown>
  description: string
}

export async function* streamGPT5(
  messages: ChatMessage[],
  options: GPT5StreamOptions = {}
): AsyncGenerator<string, void, unknown> {
  // Logging and telemetry
  console.log('GPT-5 Stream Initiated', {
    messageCount: messages.length,
    apiTokenAvailable: !!process.env.REPLICATE_API_TOKEN
  })

  // Validate and prepare input
  const formattedMessages = messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }))

  // Advanced configuration with best practices
  const input = {
    messages: formattedMessages,
    
    // Reasoning controls
    reasoning_effort: options.reasoning_effort || 'medium',
    verbosity: options.verbosity || 'medium',
    
    // Performance and cost optimization
    max_completion_tokens: options.max_completion_tokens || 4000,
    
    // Enhanced system prompt with role clarity
    system_prompt: options.system_prompt || 
      'You are an advanced AI assistant designed to provide helpful, accurate, and context-aware responses. ' +
      'Break down complex tasks, think step-by-step, and prioritize clarity and precision.',
    
    // Optional multimodal support
    ...(options.image_input && { image_input: options.image_input })
  }

  // Logging input for debugging
  console.log('GPT-5 Input Configuration:', JSON.stringify(input, null, 2))

  // Model priority list with fallback strategies
  const modelFallbackList: ModelConfig[] = [
    { 
      name: "openai/gpt-4o" as ReplicateModelId, 
      input: input,
      description: "Primary GPT-4o model for advanced reasoning"
    },
    { 
      name: "meta/llama-2-70b-chat" as ReplicateModelId, 
      input: { 
        prompt: formattedMessages.map(m => `${m.role}: ${m.content}`).join('\n'),
        max_new_tokens: 1000
      },
      description: "Fallback model for general conversation"
    },
    { 
      name: "mistralai/mistral-7b-instruct-v0.1" as ReplicateModelId, 
      input: { 
        prompt: formattedMessages.map(m => `${m.role}: ${m.content}`).join('\n'),
        max_new_tokens: 800
      },
      description: "Lightweight fallback model"
    }
  ]

  // Attempt models with comprehensive error handling
  for (const model of modelFallbackList) {
    try {
      console.log(`Attempting model: ${model.name} - ${model.description}`)
      
      const stream = replicate.stream(model.name, { input: model.input })
      
      for await (const event of stream) {
        // Robust event parsing
        if (typeof event === 'string') {
          yield event
        } else if (event && typeof event === 'object' && 'content' in event) {
          yield (event as { content: string }).content
        }
      }
      
      // Successful model usage
      console.log(`Successfully used model: ${model.name}`)
      return
    } catch (modelError) {
      console.error(`Model ${model.name} failed:`, modelError)
      
      // Detailed error logging
      if (modelError instanceof Error) {
        console.error('Error details:', {
          name: modelError.name,
          message: modelError.message,
          stack: modelError.stack
        })
      }
      
      // Continue to next model
      continue
    }
  }

  // Comprehensive fallback if all models fail
  throw new Error('All AI models failed. Please check your configuration and API access.')
}

export default replicate
