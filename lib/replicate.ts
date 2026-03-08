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

const FIRST_TOKEN_TIMEOUT_MS = 15_000
const BETWEEN_TOKEN_TIMEOUT_MS = 10_000

function raceTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}: timeout after ${ms}ms`)), ms)
    ),
  ])
}

export async function* streamGPT5(
  messages: ChatMessage[],
  options: GPT5StreamOptions = {}
): AsyncGenerator<string, void, unknown> {
  console.log('GPT-5 Stream Initiated', {
    messageCount: messages.length,
    apiTokenAvailable: !!process.env.REPLICATE_API_TOKEN
  })

  const formattedMessages = messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }))

  const promptFromMessages = formattedMessages
    .map(m => `${m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System'}: ${m.content}`)
    .join('\n\n') + '\n\nAssistant:'

  const modelFallbackList: ModelConfig[] = [
    {
      name: "openai/gpt-5" as ReplicateModelId,
      input: {
        messages: formattedMessages,
        system_prompt: options.system_prompt || 'You are a helpful AI assistant. Provide clear, accurate responses. Use markdown formatting when appropriate.',
        reasoning_effort: options.reasoning_effort || 'medium',
        verbosity: options.verbosity || 'medium',
        max_completion_tokens: options.max_completion_tokens || 4096,
        image_input: options.image_input || [],
      },
      description: "GPT-5"
    },
    {
      name: "openai/gpt-4o-mini" as ReplicateModelId,
      input: {
        messages: formattedMessages,
        system_prompt: options.system_prompt || 'You are a helpful AI assistant. Provide clear, accurate responses. Use markdown formatting when appropriate.',
        max_completion_tokens: options.max_completion_tokens || 4096,
        temperature: 0.7,
        top_p: 1,
        image_input: options.image_input || [],
      },
      description: "GPT-4o-mini"
    },
    {
      name: "meta/meta-llama-3-70b-instruct" as ReplicateModelId,
      input: {
        prompt: promptFromMessages,
        system_prompt: options.system_prompt || 'You are a helpful AI assistant.',
        max_tokens: Math.min(options.max_completion_tokens || 2048, 2048),
        temperature: 0.7,
      },
      description: "Llama 3 70B"
    },
  ]

  for (const model of modelFallbackList) {
    try {
      console.log(`Attempting model: ${model.name} - ${model.description}`)

      const stream = replicate.stream(model.name, { input: model.input })
      const iterator = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      let hasYielded = false
      let isFirstToken = true

      while (true) {
        const timeoutMs = isFirstToken ? FIRST_TOKEN_TIMEOUT_MS : BETWEEN_TOKEN_TIMEOUT_MS
        let result: IteratorResult<unknown>
        try {
          result = await raceTimeout(iterator.next(), timeoutMs, isFirstToken ? 'first-token' : 'stream')
        } catch (timeoutErr) {
          console.warn(`${model.name} timed out (${isFirstToken ? 'first token' : 'between tokens'})`)
          try { await (iterator.return as (() => Promise<unknown>))?.() } catch {}
          break
        }

        if (result.done) break

        const event = result.value
        let token: string | null = null
        if (typeof event === 'string') {
          token = event
        } else if (event && typeof event === 'object') {
          if ('data' in event && typeof (event as Record<string, unknown>).data === 'string') {
            token = (event as Record<string, unknown>).data as string
          } else if ('content' in event && typeof (event as Record<string, unknown>).content === 'string') {
            token = (event as Record<string, unknown>).content as string
          }
        }

        if (token !== null) {
          hasYielded = true
          isFirstToken = false
          yield token
        }
      }

      if (hasYielded) {
        console.log(`Successfully used model: ${model.name}`)
        return
      }
    } catch (modelError) {
      console.error(`Model ${model.name} failed:`, modelError)
      continue
    }
  }

  yield "Désolé, les modèles sont temporairement indisponibles. Veuillez réessayer dans un instant."
}

export default replicate
