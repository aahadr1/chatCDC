'use client'

import { useState, useEffect, useRef } from 'react'
import { MessageCircle, Plus, FolderPlus, MoreVertical, Trash2, Edit3, Upload, FileText, X } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'

interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  created_at: string
  file_url?: string
  file_name?: string
}

interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
}

interface UploadedFile {
  id: string
  file_name: string
  file_url: string
  file_size: number
  file_type: string
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Initialize with a default conversation
  useEffect(() => {
    const defaultConversation: Conversation = {
      id: crypto.randomUUID(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
    setConversations([defaultConversation])
    setCurrentConversationId(defaultConversation.id)
  }, [])

  const createNewConversation = async () => {
    const newConversation: Conversation = {
      id: crypto.randomUUID(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    // Save to database
    const { error } = await supabase
      .from('conversations')
      .insert({
        id: newConversation.id,
        title: newConversation.title,
        user_id: 'anonymous',
        created_at: newConversation.createdAt.toISOString(),
        updated_at: newConversation.updatedAt.toISOString()
      })

    if (error) {
      console.error('Error creating conversation:', error)
    }

    setConversations(prev => [newConversation, ...prev])
    setCurrentConversationId(newConversation.id)
    setMessages([])
    setUploadedFiles([])
  }

  const createNewProject = () => {
    // For now, this creates a new conversation with a different title
    const newProject: Conversation = {
      id: crypto.randomUUID(),
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

  const handleFileUpload = async (file: File) => {
    if (!currentConversationId) return

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('conversationId', currentConversationId)
      formData.append('userId', 'anonymous')

      const response = await fetch('/api/upload-pdf', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (result.success) {
        setUploadedFiles(prev => [...prev, result.file])
      } else {
        alert('Failed to upload file: ' + result.error)
      }
    } catch (error) {
      console.error('Upload error:', error)
      alert('Failed to upload file')
    } finally {
      setIsUploading(false)
    }
  }

  const removeUploadedFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(file => file.id !== fileId))
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputMessage.trim() || loading || !currentConversationId) return

    // Store the message content before clearing the input
    const messageContent = inputMessage.trim()
    
    const userMessage: Message = {
      id: Date.now().toString(),
      content: messageContent,
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

    try {
      // Call GPT-5 API
      console.log('Sending messages to API:', newMessages)
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: newMessages,
          conversationId: currentConversationId,
          userId: 'anonymous'
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let assistantMessage = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.content) {
                  assistantMessage += data.content
                  // Update the assistant message in real-time
                  const tempMessages = [...newMessages, {
                    id: 'temp-assistant',
                    content: assistantMessage,
                    role: 'assistant' as const,
                    created_at: new Date().toISOString()
                  }]
                  setMessages(tempMessages)
                }
                if (data.done) {
                  break
                }
              } catch (e) {
                // Ignore parsing errors
              }
            }
          }
        }
      }

      // Final update with complete message
      const finalMessages = [...newMessages, {
        id: (Date.now() + 1).toString(),
        content: assistantMessage,
        role: 'assistant' as const,
        created_at: new Date().toISOString()
      }]
      
      setMessages(finalMessages)
      setConversations(prev => prev.map(conv => 
        conv.id === currentConversationId 
          ? { ...conv, messages: finalMessages, updatedAt: new Date() }
          : conv
      ))

    } catch (error) {
      console.error('Error getting AI response:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Sorry, I encountered an error. Please try again.',
        role: 'assistant',
        created_at: new Date().toISOString()
      }
      const finalMessages = [...newMessages, errorMessage]
      setMessages(finalMessages)
    } finally {
      setLoading(false)
    }
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
          {/* Uploaded Files Display */}
          {uploadedFiles.length > 0 && (
            <div className="mb-4 p-3 bg-apple-gray-50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-apple-gray-600" />
                <span className="text-sm font-medium text-apple-gray-700">Uploaded Files:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {uploadedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-apple-gray-200"
                  >
                    <FileText className="w-4 h-4 text-apple-blue-500" />
                    <span className="text-sm text-apple-gray-700 truncate max-w-32">
                      {file.file_name}
                    </span>
                    <button
                      onClick={() => removeUploadedFile(file.id)}
                      className="text-apple-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSendMessage} className="flex gap-3">
            <div className="flex-1 flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    handleFileUpload(file)
                    e.target.value = '' // Reset input
                  }
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || isUploading}
                className="p-3 border border-apple-gray-200 rounded-xl hover:bg-apple-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Upload PDF"
              >
                {isUploading ? (
                  <div className="w-5 h-5 border-2 border-apple-blue-500 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Upload className="w-5 h-5 text-apple-gray-600" />
                )}
              </button>
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 input-field"
              disabled={loading}
            />
            </div>
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
