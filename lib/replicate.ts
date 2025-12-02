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
  /** Control model's reasoning depth - minimal, low, medium, high */
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high'
  
  /** Control response verbosity - low, medium, high */
  verbosity?: 'low' | 'medium' | 'high'
  
  /** Maximum number of completion tokens to generate */
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
  console.log('GPT-5 Stream Initiated', {
    messageCount: messages.length,
    apiTokenAvailable: !!process.env.REPLICATE_API_TOKEN
  })

  // Format messages for the API
  const formattedMessages = messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }))

  // Build prompt from messages if needed (for models that use prompt instead of messages)
  const promptFromMessages = formattedMessages
    .map(m => `${m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System'}: ${m.content}`)
    .join('\n\n') + '\n\nAssistant:'

  // Get the last user message for simple prompt
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || ''

  // Model configurations following Replicate's GPT-5 and GPT-4o-mini specs
  const modelFallbackList: ModelConfig[] = [
    { 
      // Primary: GPT-5 - OpenAI's most capable model
      name: "openai/gpt-5" as ReplicateModelId, 
      input: {
        messages: formattedMessages,
        system_prompt: options.system_prompt || 'You are ChatCDC, an advanced AI assistant. Provide clear, helpful, and accurate responses. Use markdown formatting when appropriate.',
        reasoning_effort: options.reasoning_effort || 'medium',
        verbosity: options.verbosity || 'medium',
        max_completion_tokens: options.max_completion_tokens || 4096,
        image_input: options.image_input || [],
      },
      description: "GPT-5 - OpenAI's most capable model for advanced reasoning"
    },
    { 
      // Fallback: GPT-4o-mini - Fast and cost-effective
      name: "openai/gpt-4o-mini" as ReplicateModelId, 
      input: {
        messages: formattedMessages,
        system_prompt: options.system_prompt || 'You are ChatCDC, an advanced AI assistant. Provide clear, helpful, and accurate responses. Use markdown formatting when appropriate.',
        max_completion_tokens: options.max_completion_tokens || 4096,
        temperature: 0.7,
        top_p: 1,
        image_input: options.image_input || [],
      },
      description: "GPT-4o-mini - Fast, low-latency OpenAI model"
    },
    { 
      // Secondary fallback: Meta Llama
      name: "meta/meta-llama-3-70b-instruct" as ReplicateModelId, 
      input: { 
        prompt: promptFromMessages,
        system_prompt: options.system_prompt || 'You are ChatCDC, an advanced AI assistant.',
        max_tokens: Math.min(options.max_completion_tokens || 2048, 2048),
        temperature: 0.7,
      },
      description: "Llama 3 70B - Meta's powerful open model"
    },
  ]

  // Attempt models with comprehensive error handling
  for (const model of modelFallbackList) {
    try {
      console.log(`Attempting model: ${model.name} - ${model.description}`)
      console.log('Input:', JSON.stringify(model.input, null, 2))
      
      const stream = replicate.stream(model.name, { input: model.input })
      let hasYielded = false
      
      for await (const event of stream) {
        // Handle different event types from Replicate
        if (typeof event === 'string') {
          hasYielded = true
          yield event
        } else if (event && typeof event === 'object') {
          if ('data' in event && typeof event.data === 'string') {
            hasYielded = true
            yield event.data
          } else if ('content' in event && typeof event.content === 'string') {
            hasYielded = true
            yield event.content
          }
        }
      }
      
      if (hasYielded) {
        console.log(`Successfully used model: ${model.name}`)
        return
      }
    } catch (modelError) {
      console.error(`Model ${model.name} failed:`, modelError)
      
      if (modelError instanceof Error) {
        console.error('Error details:', {
          name: modelError.name,
          message: modelError.message,
        })
      }
      
      // Continue to next model
      continue
    }
  }

  // If all models fail, yield an error message
  yield "I apologize, but I'm currently experiencing technical difficulties. Please try again in a moment."
}

export default replicate
