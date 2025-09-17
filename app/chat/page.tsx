'use client'

import { useState, useEffect, useRef } from 'react'
import { MessageCircle, Plus, Send, Loader2, Menu, X, LogOut, User, FolderPlus, Folder, Camera } from 'lucide-react'
import { apiClient } from '@/lib/apiClient'
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
      const token = localStorage.getItem('access_token')
      if (!token) {
        router.push('/auth')
        return
      }

      apiClient.setAccessToken(token)
      const { data, error } = await apiClient.getCurrentUser()
      
      if (error || !data || typeof data !== 'object' || !('user' in data)) {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        router.push('/auth')
        return
      }

      setUser((data as any).user)
      await loadConversations()
    }
    
    initializeUser()
  }, [router])

  // Load conversations from database
  const loadConversations = async () => {
    try {
      const { data, error } = await apiClient.getConversations()

      if (error) throw new Error(error)
      if (
        data &&
        typeof data === 'object' &&
        'conversations' in data &&
        Array.isArray((data as any).conversations) &&
        (data as any).conversations.length > 0
      ) {
        const conversations = (data as any).conversations.map((conv: any) => ({
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
      const { data, error } = await apiClient.getMessages(conversationId)

      if (error) throw new Error(error)
      if (
        data &&
        typeof data === 'object' &&
        'messages' in data &&
        Array.isArray((data as any).messages)
      ) {
        const messages = (data as any).messages.map((msg: any) => ({
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
      const { data, error } = await apiClient.createConversation('New Chat')

      if (error) throw new Error(error)
      if (
        data &&
        typeof data === 'object' &&
        'conversation' in data &&
        (data as any).conversation
      ) {
        const convData = (data as any).conversation
        const newConversation: Conversation = {
          id: convData.id,
          title: convData.title,
          messages: [],
          createdAt: new Date(convData.created_at),
          updatedAt: new Date(convData.updated_at)
        }

        setConversations(prev => [newConversation, ...prev])
        setCurrentConversationId(newConversation.id)
        setMessages([])
      }
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
      const { error } = await apiClient.deleteConversation(conversationId)

      if (error) throw new Error(error)

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
    try {
      await apiClient.signOut()
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      apiClient.setAccessToken(null)
      router.push('/auth')
    } catch (error) {
      console.error('Sign out error:', error)
      // Still redirect even if sign out fails
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      apiClient.setAccessToken(null)
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
      const { data: userMessageData, error: userMessageError } = await apiClient.createMessage(
        currentConversationId,
        messageContent,
        'user'
      )

      if (userMessageError) throw new Error(userMessageError)

      const userMsg = (userMessageData as any).message
      const userMessage: Message = {
        id: userMsg.id,
        content: userMsg.content,
        role: 'user',
        timestamp: new Date(userMsg.created_at)
      }

      // Update conversation title if it's the first message
      if (messages.length === 0) {
        const title = generateTitle(messageContent)
        await apiClient.updateConversation(currentConversationId, { title })

        setConversations(prev => prev.map(conv => 
          conv.id === currentConversationId 
            ? { ...conv, title, updatedAt: new Date() }
            : conv
        ))
      }

      const newMessages = [...messages, userMessage]
      setMessages(newMessages)

      // Get AI response
      const response = await apiClient.sendChatMessage(
        newMessages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        currentConversationId,
        user.id
      )

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
      const { data: assistantMessageData, error: assistantMessageError } = await apiClient.createMessage(
        currentConversationId,
        assistantMessage || 'I apologize, but I couldn\'t generate a response. Please try again.',
        'assistant'
      )

      if (assistantMessageError) throw new Error(assistantMessageError)

      const assistantMsg = (assistantMessageData as any).message
      const finalAssistantMessage: Message = {
        id: assistantMsg.id,
        content: assistantMsg.content,
        role: 'assistant',
        timestamp: new Date(assistantMsg.created_at)
      }

      const finalMessages = [...newMessages, finalAssistantMessage]
      setMessages(finalMessages)

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
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-600 hover:bg-gray-800 transition-colors mb-2"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
          
          <button
            onClick={() => router.push('/projects/new')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-600 hover:bg-gray-800 transition-colors mb-2"
          >
            <FolderPlus className="w-4 h-4" />
            New Project
          </button>
          
          <button
            onClick={() => router.push('/projects')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-600 hover:bg-gray-800 transition-colors mb-2"
          >
            <Folder className="w-4 h-4" />
            My Projects
          </button>
          
          <button
            onClick={() => router.push('/camera')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-600 hover:bg-gray-800 transition-colors"
          >
            <Camera className="w-4 h-4" />
            Camera Recording
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
