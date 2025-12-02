export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
  feedback?: 'up' | 'down' | null
  file_url?: string
  file_name?: string
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
}

export interface UploadedFile {
  id: string
  file_name: string
  file_url: string
  file_size: number
  file_type: string
  content?: string
  preview?: string
  summary?: string
}

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

export interface PromptTemplate {
  id: string
  user_id?: string
  name: string
  content: string
  description?: string
  icon?: string
  is_system: boolean
  created_at: string
}

export interface ChatSettings {
  verbosity: 'low' | 'medium' | 'high'
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high'
  enableWebSearch: boolean
  maxTokens: number
}

export interface ReplicateRequest {
  model?: string
  prompt?: string
  instructions?: string
  image_input?: string[]
  reasoning_effort?: string
  verbosity?: string
  enable_web_search?: boolean
  max_output_tokens?: number
  tools?: any[]
  json_schema?: object
  simple_schema?: string[]
  input_item_list?: any[]
  previous_response_id?: string
}

export interface ReplicateResponse {
  text: string
  response_id: string
}
