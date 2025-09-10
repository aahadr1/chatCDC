'use client'

import { useState, useEffect, useRef } from 'react'
import { MessageCircle, Plus, Send, Loader2, Menu, X, LogOut, User } from 'lucide-react'
import { supabase, signOut, getCurrentUser } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: Date
}

interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
}

interface User {
  id: string
  email: string
  full_name?: string
}

export default function ChatPage() {
  const [user, setUser] = useState<User | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Initialize user and load conversations
  useEffect(() => {
    const initializeUser = async () => {
      const { user } = await getCurrentUser()
      if (user) {
        setUser({
          id: user.id,
          email: user.email!,
          full_name: user.user_metadata?.full_name || user.user_metadata?.display_name
        })
        await loadConversations(user.id)
      } else {
        router.push('/auth')
      }
    }
    
    initializeUser()
  }, [router])

  // Load conversations from database
  const loadConversations = async (userId: string) => {
    try {
      const { data: conversationsData, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (error) throw error

      if (conversationsData && conversationsData.length > 0) {
        const conversations = conversationsData.map(conv => ({
          id: conv.id,
          title: conv.title,
          messages: [],
          createdAt: new Date(conv.created_at),
          updatedAt: new Date(conv.updated_at)
        }))
        setConversations(conversations)
        setCurrentConversationId(conversations[0].id)
        await loadMessages(conversations[0].id)
      } else {
        // Create default conversation if none exist
        await createNewConversation()
      }
    } catch (error) {
      console.error('Error loading conversations:', error)
    }
  }

  // Load messages for a conversation
  const loadMessages = async (conversationId: string) => {
    try {
      const { data: messagesData, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (error) throw error

      if (messagesData) {
        const messages = messagesData.map(msg => ({
          id: msg.id,
          content: msg.content,
          role: msg.role as 'user' | 'assistant',
          timestamp: new Date(msg.created_at)
        }))
        setMessages(messages)
      }
    } catch (error) {
      console.error('Error loading messages:', error)
    }
  }

  const createNewConversation = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          title: 'New Chat',
          user_id: user.id
        })
        .select()
        .single()

      if (error) throw error

      const newConversation: Conversation = {
        id: data.id,
        title: data.title,
        messages: [],
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      }

      setConversations(prev => [newConversation, ...prev])
      setCurrentConversationId(newConversation.id)
      setMessages([])
    } catch (error) {
      console.error('Error creating conversation:', error)
    }
  }

  const switchConversation = async (conversationId: string) => {
    setCurrentConversationId(conversationId)
    await loadMessages(conversationId)
  }

  const deleteConversation = async (conversationId: string) => {
    try {
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId)

      if (error) throw error

      setConversations(prev => prev.filter(c => c.id !== conversationId))
      
      if (currentConversationId === conversationId) {
        const remaining = conversations.filter(c => c.id !== conversationId)
        if (remaining.length > 0) {
          setCurrentConversationId(remaining[0].id)
          await loadMessages(remaining[0].id)
        } else {
          await createNewConversation()
        }
      }
    } catch (error) {
      console.error('Error deleting conversation:', error)
    }
  }

  const handleSignOut = async () => {
    const { error } = await signOut()
    if (!error) {
      router.push('/auth')
    }
  }

  const generateTitle = (message: string): string => {
    // Generate a smart title from the first message
    const words = message.trim().split(' ').slice(0, 4)
    return words.join(' ') + (message.trim().split(' ').length > 4 ? '...' : '')
  }

  // Auto-resize textarea
  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value)
    adjustTextareaHeight()
  }

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || loading || !currentConversationId || !user) return

    const messageContent = inputMessage.trim()
    setInputMessage('')
    setLoading(true)

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      // Save user message to database
      const { data: userMessageData, error: userMessageError } = await supabase
        .from('messages')
        .insert({
          conversation_id: currentConversationId,
          user_id: user.id,
          role: 'user',
          content: messageContent
        })
        .select()
        .single()

      if (userMessageError) throw userMessageError

      const userMessage: Message = {
        id: userMessageData.id,
        content: userMessageData.content,
        role: 'user',
        timestamp: new Date(userMessageData.created_at)
      }

      // Update conversation title if it's the first message
      if (messages.length === 0) {
        const title = generateTitle(messageContent)
        await supabase
          .from('conversations')
          .update({ title })
          .eq('id', currentConversationId)

        setConversations(prev => prev.map(conv => 
          conv.id === currentConversationId 
            ? { ...conv, title, updatedAt: new Date() }
            : conv
        ))
      }

      const newMessages = [...messages, userMessage]
      setMessages(newMessages)

      // Get AI response
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({
          messages: newMessages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          conversationId: currentConversationId,
          userId: user.id
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let assistantMessage = ''

      if (reader) {
        let buffer = ''
        
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          
          // Keep the last potentially incomplete line in buffer
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmedLine = line.trim()
            if (trimmedLine.startsWith('data: ')) {
              const dataStr = trimmedLine.slice(6).trim()
              if (dataStr && dataStr !== '[DONE]') {
                try {
                  const data = JSON.parse(dataStr)
                  if (data.content && typeof data.content === 'string') {
                    assistantMessage += data.content
                    // Update the assistant message in real-time
                    const tempMessages = [...newMessages, {
                      id: 'temp-assistant',
                      content: assistantMessage,
                      role: 'assistant' as const,
                      timestamp: new Date()
                    }]
                    setMessages(tempMessages)
                  }
                  if (data.done) {
                    break
                  }
                } catch (e) {
                  // Ignore malformed JSON
                  console.warn('Failed to parse SSE data:', dataStr)
                }
              }
            }
          }
        }
      }

      // Save assistant message to database
      const { data: assistantMessageData, error: assistantMessageError } = await supabase
        .from('messages')
        .insert({
          conversation_id: currentConversationId,
          user_id: user.id,
          role: 'assistant',
          content: assistantMessage || 'I apologize, but I couldn\'t generate a response. Please try again.'
        })
        .select()
        .single()

      if (assistantMessageError) throw assistantMessageError

      const finalAssistantMessage: Message = {
        id: assistantMessageData.id,
        content: assistantMessageData.content,
        role: 'assistant',
        timestamp: new Date(assistantMessageData.created_at)
      }

      const finalMessages = [...newMessages, finalAssistantMessage]
      setMessages(finalMessages)

      // Update conversation updated_at
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', currentConversationId)

    } catch (error) {
      console.error('Error in chat:', error)
      const errorMessage: Message = {
        id: 'error-' + Date.now(),
        content: 'Sorry, I encountered an error. Please check your API configuration and try again.',
        role: 'assistant',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }


  return (
    <div className="h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 bg-gray-900 text-white flex flex-col overflow-hidden`}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-bold">ChatCDC</h1>
          </div>
          
          <button
            onClick={createNewConversation}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-600 hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-2">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`group relative flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer transition-colors ${
                currentConversationId === conversation.id 
                  ? 'bg-gray-800' 
                  : 'hover:bg-gray-800'
              }`}
              onClick={() => switchConversation(conversation.id)}
            >
              <MessageCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{conversation.title}</p>
              </div>
              {conversations.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteConversation(conversation.id)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-700 rounded transition-all"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* User Profile */}
        {user && (
          <div className="p-4 border-t border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user.full_name || user.email}
                </p>
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {conversations.find(c => c.id === currentConversationId)?.title || 'ChatCDC'}
              </h1>
              <p className="text-sm text-gray-500">Powered by GPT-5</p>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md mx-auto px-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <MessageCircle className="w-8 h-8 text-blue-600" />
                </div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  Welcome to ChatCDC
                </h2>
                <p className="text-gray-600 leading-relaxed">
                  I'm your AI assistant powered by GPT-5. Ask me anything - from coding help to creative writing, 
                  analysis, math problems, or just casual conversation. How can I help you today?
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
              {messages.map((message) => (
                <div key={message.id} className="group">
                  <div className={`flex gap-4 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                      {message.role === 'user' ? (
                        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm font-medium">U</span>
                        </div>
                      ) : (
                        <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                          <MessageCircle className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>
                    <div className={`flex-1 ${message.role === 'user' ? 'text-right' : ''}`}>
                      <div className={`inline-block max-w-[80%] px-4 py-3 rounded-2xl ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-900'
                      }`}>
                        <div className="whitespace-pre-wrap break-words">{message.content}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {loading && (
                <div className="group">
                  <div className="flex gap-4">
                    <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                      <MessageCircle className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="inline-block bg-white border border-gray-200 px-4 py-3 rounded-2xl">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                          <span className="text-gray-500">Thinking...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-3">
              <div className="flex-1">
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={inputMessage}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Message ChatCDC..."
                    className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent max-h-32"
                    style={{ minHeight: '50px' }}
                    disabled={loading}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={loading || !inputMessage.trim()}
                    className="absolute right-2 bottom-2 w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-colors"
                  >
                    <Send className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-500 text-center">
              ChatCDC can make mistakes. Please verify important information.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
