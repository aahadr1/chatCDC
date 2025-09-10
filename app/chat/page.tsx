'use client'

import { useState, useEffect } from 'react'
import { MessageCircle, Plus, FolderPlus, MoreVertical, Trash2, Edit3 } from 'lucide-react'

interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  created_at: string
}

interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Initialize with a default conversation
  useEffect(() => {
    const defaultConversation: Conversation = {
      id: 'default',
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
    setConversations([defaultConversation])
    setCurrentConversationId('default')
  }, [])

  const createNewConversation = () => {
    const newConversation: Conversation = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
    setConversations(prev => [newConversation, ...prev])
    setCurrentConversationId(newConversation.id)
    setMessages([])
  }

  const createNewProject = () => {
    // For now, this creates a new conversation with a different title
    const newProject: Conversation = {
      id: Date.now().toString(),
      title: 'New Project',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
    setConversations(prev => [newProject, ...prev])
    setCurrentConversationId(newProject.id)
    setMessages([])
  }

  const switchConversation = (conversationId: string) => {
    const conversation = conversations.find(c => c.id === conversationId)
    if (conversation) {
      setCurrentConversationId(conversationId)
      setMessages(conversation.messages)
    }
  }

  const deleteConversation = (conversationId: string) => {
    setConversations(prev => prev.filter(c => c.id !== conversationId))
    if (currentConversationId === conversationId) {
      const remaining = conversations.filter(c => c.id !== conversationId)
      if (remaining.length > 0) {
        setCurrentConversationId(remaining[0].id)
        setMessages(remaining[0].messages)
      } else {
        createNewConversation()
      }
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputMessage.trim() || loading || !currentConversationId) return

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      role: 'user',
      created_at: new Date().toISOString()
    }

    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInputMessage('')
    setLoading(true)

    // Update conversation with new message
    setConversations(prev => prev.map(conv => 
      conv.id === currentConversationId 
        ? { ...conv, messages: newMessages, updatedAt: new Date() }
        : conv
    ))

    // Simulate AI response (replace with actual AI integration)
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `I received your message: "${inputMessage}". This is a placeholder response. In a real implementation, this would connect to your AI service.`,
        role: 'assistant',
        created_at: new Date().toISOString()
      }
      const finalMessages = [...newMessages, aiMessage]
      setMessages(finalMessages)
      
      // Update conversation with AI response
      setConversations(prev => prev.map(conv => 
        conv.id === currentConversationId 
          ? { ...conv, messages: finalMessages, updatedAt: new Date() }
          : conv
      ))
      
      setLoading(false)
    }, 1000)
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-apple-gray-50 to-white flex">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 bg-white border-r border-apple-gray-200 flex flex-col overflow-hidden`}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-apple-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-apple-blue-500 to-apple-blue-600 rounded-lg flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-apple-gray-900">ChatCDC</h1>
          </div>
          
          {/* Action Buttons */}
          <div className="space-y-2">
            <button
              onClick={createNewConversation}
              className="w-full sidebar-item"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </button>
            <button
              onClick={createNewProject}
              className="w-full sidebar-item"
            >
              <FolderPlus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-2">
            <h3 className="text-xs font-semibold text-apple-gray-500 uppercase tracking-wide mb-2 px-2">
              Recent Chats
            </h3>
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`sidebar-item group relative ${
                  currentConversationId === conversation.id ? 'active' : ''
                }`}
                onClick={() => switchConversation(conversation.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{conversation.title}</p>
                  <p className="text-xs text-apple-gray-500">
                    {conversation.messages.length} messages
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteConversation(conversation.id)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all"
                >
                  <Trash2 className="w-3 h-3 text-red-500" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-apple-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 hover:bg-apple-gray-100 rounded-lg transition-colors"
              >
                <div className="w-5 h-5 flex flex-col justify-center gap-1">
                  <div className="w-4 h-0.5 bg-apple-gray-600"></div>
                  <div className="w-4 h-0.5 bg-apple-gray-600"></div>
                  <div className="w-4 h-0.5 bg-apple-gray-600"></div>
                </div>
              </button>
              <div>
                <h1 className="text-xl font-bold text-apple-gray-900">
                  {conversations.find(c => c.id === currentConversationId)?.title || 'ChatCDC'}
                </h1>
                <p className="text-sm text-apple-gray-600">AI Assistant</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-apple-gray-600">
                <span>Welcome to ChatCDC</span>
              </div>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gradient-to-br from-apple-blue-500 to-apple-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-apple-gray-900 mb-2">
                Welcome to ChatCDC
              </h2>
              <p className="text-apple-gray-600 max-w-md mx-auto">
                Start a conversation with your AI assistant. Ask questions, get help with tasks, or just chat!
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] px-4 py-3 rounded-2xl ${
                    message.role === 'user'
                      ? 'bg-apple-blue-500 text-white'
                      : 'bg-white border border-apple-gray-200 text-apple-gray-900'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))
          )}
          
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-apple-gray-200 px-4 py-3 rounded-2xl">
                <div className="flex items-center gap-2">
                  <div className="typing-indicator">
                    <span>●</span>
                    <span>●</span>
                    <span>●</span>
                  </div>
                  <span className="text-apple-gray-500 text-sm">AI is thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-apple-gray-200 p-6">
          <form onSubmit={handleSendMessage} className="flex gap-3">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 input-field"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !inputMessage.trim()}
              className="btn-primary px-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
