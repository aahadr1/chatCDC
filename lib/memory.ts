import { supabase } from './supabaseClient'

export interface Memory {
  id: string
  user_id: string
  content: string
  created_at: string
}

export interface ChatSummary {
  id: string
  conversation_id: string
  summary: string
  message_range: {
    start_id: string
    end_id: string
    message_count: number
  }
  created_at: string
}

// Store a user memory
export async function storeMemory(userId: string, content: string): Promise<Memory | null> {
  const { data, error } = await supabase
    .from('user_memories')
    .insert({
      id: crypto.randomUUID(),
      user_id: userId,
      content,
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('Error storing memory:', error)
    return null
  }

  return data
}

// Get all memories for a user
export async function getMemories(userId: string): Promise<Memory[]> {
  const { data, error } = await supabase
    .from('user_memories')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching memories:', error)
    return []
  }

  return data || []
}

// Delete a memory
export async function deleteMemory(memoryId: string): Promise<boolean> {
  const { error } = await supabase
    .from('user_memories')
    .delete()
    .eq('id', memoryId)

  if (error) {
    console.error('Error deleting memory:', error)
    return false
  }

  return true
}

// Store a chat summary
export async function storeChatSummary(
  conversationId: string,
  summary: string,
  messageRange: { start_id: string; end_id: string; message_count: number }
): Promise<ChatSummary | null> {
  const { data, error } = await supabase
    .from('chat_summaries')
    .insert({
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      summary,
      message_range: messageRange,
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('Error storing chat summary:', error)
    return null
  }

  return data
}

// Get summaries for a conversation
export async function getChatSummaries(conversationId: string): Promise<ChatSummary[]> {
  const { data, error } = await supabase
    .from('chat_summaries')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching chat summaries:', error)
    return []
  }

  return data || []
}

// Build context from memories and summaries
export function buildMemoryContext(memories: Memory[], summaries: ChatSummary[]): string {
  let context = ''

  if (memories.length > 0) {
    context += '## User Memories\n'
    context += 'The following are important facts about the user:\n'
    memories.slice(0, 10).forEach((memory, i) => {
      context += `${i + 1}. ${memory.content}\n`
    })
    context += '\n'
  }

  if (summaries.length > 0) {
    context += '## Previous Conversation Context\n'
    summaries.slice(-3).forEach((summary) => {
      context += `- ${summary.summary}\n`
    })
    context += '\n'
  }

  return context
}

// Parse "remember this" commands from user input
export function parseRememberCommand(input: string): string | null {
  const patterns = [
    /^remember\s+(?:that\s+)?(.+)$/i,
    /^please\s+remember\s+(?:that\s+)?(.+)$/i,
    /^note\s+(?:that\s+)?(.+)$/i,
    /^save\s+(?:that\s+)?(.+)$/i,
  ]

  for (const pattern of patterns) {
    const match = input.match(pattern)
    if (match) {
      return match[1].trim()
    }
  }

  return null
}

// Generate a summary from messages using the AI
export async function generateSummary(messages: Array<{ role: string; content: string }>): Promise<string> {
  // This would typically call the AI to generate a summary
  // For now, return a simple concatenation
  const userMessages = messages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join(' ')
  
  return userMessages.length > 200 
    ? userMessages.substring(0, 200) + '...' 
    : userMessages
}

