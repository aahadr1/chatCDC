export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isTyping?: boolean;
  feedback?: 'up' | 'down' | null;
  images?: string[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatSettings {
  model: 'gpt-5' | 'gpt-5-mini' | 'gpt-5-nano';
  verbosity: 'low' | 'medium' | 'high';
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high';
  enableWebSearch: boolean;
  maxTokens?: number;
}

export interface ReplicateRequest {
  model?: string;
  prompt?: string;
  instructions?: string;
  image_input?: string[];
  reasoning_effort?: string;
  verbosity?: string;
  enable_web_search?: boolean;
  max_output_tokens?: number;
  tools?: any[];
  json_schema?: object;
  simple_schema?: string[];
  input_item_list?: any[];
  previous_response_id?: string;
}

export interface ReplicateResponse {
  text: string;
  response_id: string;
}
