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
    console.log('GPT-5 streamGPT5 called with messages:', messages)
    console.log('Replicate API token exists:', !!process.env.REPLICATE_API_TOKEN)
    
    // Convert messages to the format expected by GPT-5
    const formattedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }))

    const input = {
      messages: formattedMessages,
      verbosity: options.verbosity || 'medium',
      reasoning_effort: options.reasoning_effort || 'minimal',
      max_completion_tokens: options.max_completion_tokens || 4000,
      system_prompt: options.system_prompt || 'You are a helpful AI assistant.'
    }

    console.log('Streaming GPT-5 with input:', JSON.stringify(input, null, 2))

    // Try GPT-5 first, then fallback to a working model
    const models = [
      { name: "openai/gpt-5", input: input },
      { name: "meta/llama-2-70b-chat", input: { 
        prompt: formattedMessages.map(m => `${m.role}: ${m.content}`).join('\n'),
        max_new_tokens: 1000
      }},
      { name: "mistralai/mistral-7b-instruct-v0.1", input: {
        prompt: formattedMessages.map(m => `${m.role}: ${m.content}`).join('\n'),
        max_new_tokens: 1000
      }}
    ]

    for (const model of models) {
      try {
        console.log(`Trying model: ${model.name}`)
        for await (const event of replicate.stream(model.name, { input: model.input })) {
          console.log(`${model.name} event received:`, event)
          if (typeof event === 'string') {
            yield event
          } else if (event && typeof event === 'object' && 'content' in event) {
            yield event.content as string
          }
        }
        console.log(`Successfully used model: ${model.name}`)
        return // Exit successfully
      } catch (modelError) {
        console.error(`Model ${model.name} failed:`, modelError)
        continue // Try next model
      }
    }
    
    // If all models fail, throw an error
    throw new Error('All AI models failed to respond')
  } catch (error) {
    console.error('Error streaming GPT-5:', error)
    throw error
  }
}

export default replicate