import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface GPT5Response {
  text: string
  reasoning?: string
}

export async function* streamGPT5(
  messages: ChatMessage[],
  options: {
    verbosity?: 'low' | 'medium' | 'high'
    reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high'
    max_completion_tokens?: number
    system_prompt?: string
  } = {}
): AsyncGenerator<string, void, unknown> {
  try {
    const input = {
      messages: messages,
      verbosity: options.verbosity || 'medium',
      reasoning_effort: options.reasoning_effort || 'minimal',
      max_completion_tokens: options.max_completion_tokens || 4000,
      system_prompt: options.system_prompt || 'You are a helpful AI assistant.'
    }

    for await (const event of replicate.stream("openai/gpt-5", { input })) {
      if (typeof event === 'string') {
        yield event
      }
    }
  } catch (error) {
    console.error('Error streaming GPT-5:', error)
    throw error
  }
}

export default replicate