'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { 
  MessageCircle, 
  Send, 
  Loader2, 
  Menu, 
  X, 
  ArrowLeft, 
  FileText,
  Download,
  Eye,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2
} from 'lucide-react'
import { supabase, getCurrentUser } from '@/lib/supabaseClient'

interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: Date
}

interface Document {
  id: string
  original_filename: string
  file_type: string
  file_size: number
  file_url: string
  extracted_text: string
  text_length: number
  processing_status: string
  created_at: string
}

interface Project {
  id: string
  name: string
  description?: string
  status: string
  document_count: number
  total_characters: number
  knowledge_base: string
  created_at: string
  updated_at: string
}

interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

interface User {
  id: string
  email: string
}

export default function ProjectChatPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [user, setUser] = useState<User | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [documentsOpen, setDocumentsOpen] = useState(true)
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [documentPreview, setDocumentPreview] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Initialize user and load project data
  useEffect(() => {
    const initializeProject = async () => {
      console.log('🚀 Initializing project page for projectId:', projectId)
      
      const { user } = await getCurrentUser()
      if (user) {
        console.log('✅ User authenticated:', user.id)
        setUser({
          id: user.id,
          email: user.email!
        })
        await loadProject(user.id)
        await loadDocuments(user.id)
        await loadConversations(user.id)
      } else {
        console.log('❌ No user found, redirecting to auth')
        router.push('/auth')
      }
    }
    
    initializeProject()
  }, [router, projectId])

  const loadProject = async (userId: string) => {
    try {
      const { data: projectData, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .eq('user_id', userId)
        .single()

      if (error) throw error
      setProject(projectData)
    } catch (error) {
      console.error('Error loading project:', error)
      router.push('/projects')
    }
  }

  const loadDocuments = async (userId: string) => {
    try {
      const { data: documentsData, error } = await supabase
        .from('project_documents')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setDocuments(documentsData || [])
    } catch (error) {
      console.error('Error loading documents:', error)
    }
  }

  const loadConversations = async (userId: string) => {
    try {
      console.log('📋 Loading conversations for project:', projectId, 'user:', userId)
      
      const { data: conversationsData, error } = await supabase
        .from('project_conversations')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (error) {
        console.error('❌ Error loading conversations:', error)
        throw error
      }

      console.log('📋 Conversations loaded:', conversationsData?.length || 0)

      if (conversationsData && conversationsData.length > 0) {
        setConversations(conversationsData)
        setCurrentConversationId(conversationsData[0].id)
        console.log('✅ Set current conversation:', conversationsData[0].id)
        await loadMessages(conversationsData[0].id)
      } else {
        console.log('📝 No conversations found, creating new one')
        // Create default conversation if none exist
        await createNewConversation()
      }
    } catch (error) {
      console.error('❌ Error loading conversations:', error)
    }
  }

  const loadMessages = async (conversationId: string) => {
    try {
      const { data: messagesData, error } = await supabase
        .from('project_messages')
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
    if (!user || !project) {
      console.log('❌ Cannot create conversation - missing user or project:', { user: !!user, project: !!project })
      return
    }

    try {
      console.log('📝 Creating new conversation for project:', projectId, 'user:', user.id)
      
      const { data, error } = await supabase
        .from('project_conversations')
        .insert({
          title: 'New Chat',
          project_id: projectId,
          user_id: user.id
        })
        .select()
        .single()

      if (error) {
        console.error('❌ Error creating conversation:', error)
        
        // If table doesn't exist, create a temporary conversation ID
        if (error.message.includes('relation "public.project_conversations" does not exist')) {
          console.log('⚠️ project_conversations table does not exist, using temporary ID')
          const tempConversationId = 'temp-' + Date.now()
          setCurrentConversationId(tempConversationId)
          setMessages([])
          return
        }
        
        throw error
      }

      console.log('✅ Conversation created:', data.id)

      const newConversation = {
        id: data.id,
        title: data.title,
        created_at: data.created_at,
        updated_at: data.updated_at
      }

      setConversations(prev => [newConversation, ...prev])
      setCurrentConversationId(newConversation.id)
      setMessages([])
      
      console.log('✅ Conversation state updated')
    } catch (error) {
      console.error('❌ Error creating conversation:', error)
      
      // Fallback: create a temporary conversation
      console.log('🔄 Creating temporary conversation as fallback')
      const tempConversationId = 'temp-' + Date.now()
      setCurrentConversationId(tempConversationId)
      setMessages([])
    }
  }

  const switchConversation = async (conversationId: string) => {
    setCurrentConversationId(conversationId)
    await loadMessages(conversationId)
  }

  const deleteConversation = async (conversationId: string) => {
    if (conversations.length <= 1) return

    try {
      const { error } = await supabase
        .from('project_conversations')
        .delete()
        .eq('id', conversationId)

      if (error) throw error

      setConversations(prev => prev.filter(c => c.id !== conversationId))
      
      if (currentConversationId === conversationId) {
        const remaining = conversations.filter(c => c.id !== conversationId)
        if (remaining.length > 0) {
          setCurrentConversationId(remaining[0].id)
          await loadMessages(remaining[0].id)
        }
      }
    } catch (error) {
      console.error('Error deleting conversation:', error)
    }
  }

  const generateTitle = (message: string): string => {
    const words = message.trim().split(' ').slice(0, 4)
    return words.join(' ') + (message.trim().split(' ').length > 4 ? '...' : '')
  }

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value)
    adjustTextareaHeight()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleSendMessage = async () => {
    console.log('🔍 handleSendMessage called with:', {
      inputMessage: inputMessage.trim(),
      loading,
      currentConversationId,
      user: user?.id,
      project: project?.id
    })
    
    if (!inputMessage.trim() || loading || !currentConversationId || !user || !project) {
      console.log('❌ Early return due to missing requirements:', {
        hasInput: !!inputMessage.trim(),
        notLoading: !loading,
        hasConversation: !!currentConversationId,
        hasUser: !!user,
        hasProject: !!project
      })
      return
    }

    const messageContent = inputMessage.trim()
    setInputMessage('')
    setLoading(true)
    
    console.log('✅ Starting message send process')

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      // Save user message to database
      let userMessage: Message
      
      if (currentConversationId.startsWith('temp-')) {
        // Use temporary message for fallback
        console.log('📝 Using temporary message (no database)')
        userMessage = {
          id: 'temp-user-' + Date.now(),
          content: messageContent,
          role: 'user',
          timestamp: new Date()
        }
      } else {
        const { data: userMessageData, error: userMessageError } = await supabase
          .from('project_messages')
          .insert({
            conversation_id: currentConversationId,
            project_id: projectId,
            user_id: user.id,
            role: 'user',
            content: messageContent
          })
          .select()
          .single()

        if (userMessageError) {
          console.error('❌ Error saving user message:', userMessageError)
          
          // If table doesn't exist, use temporary message
          if (userMessageError.message.includes('relation "public.project_messages" does not exist')) {
            console.log('⚠️ project_messages table does not exist, using temporary message')
            userMessage = {
              id: 'temp-user-' + Date.now(),
              content: messageContent,
              role: 'user',
              timestamp: new Date()
            }
          } else {
            throw userMessageError
          }
        } else {
          userMessage = {
            id: userMessageData.id,
            content: userMessageData.content,
            role: 'user',
            timestamp: new Date(userMessageData.created_at)
          }
        }
      }

      // Update conversation title if it's the first message
      if (messages.length === 0 && !currentConversationId.startsWith('temp-')) {
        const title = generateTitle(messageContent)
        try {
          await supabase
            .from('project_conversations')
            .update({ title })
            .eq('id', currentConversationId)

          setConversations(prev => prev.map(conv => 
            conv.id === currentConversationId 
              ? { ...conv, title, updated_at: new Date().toISOString() }
              : conv
          ))
        } catch (error) {
          console.error('❌ Error updating conversation title:', error)
          // Continue without updating title
        }
      }

      const newMessages = [...messages, userMessage]
      setMessages(newMessages)

      // Get AI response using project knowledge base
      console.log('🚀 Sending chat request to API:', {
        projectId,
        conversationId: currentConversationId,
        userId: user.id,
        knowledgeBaseLength: project.knowledge_base?.length || 0,
        messageCount: newMessages.length
      })

      const response = await fetch('/api/project-chat', {
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
          projectId: projectId,
          conversationId: currentConversationId,
          userId: user.id,
          knowledgeBase: project.knowledge_base
        }),
      })

      console.log('📡 API response status:', response.status, response.statusText)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ API error response:', errorText)
        throw new Error(`Failed to get response: ${response.status} ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let assistantMessage = ''

      if (reader) {
        console.log('📖 Starting to read response stream')
        let buffer = ''
        
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            console.log('✅ Stream reading completed')
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmedLine = line.trim()
            if (trimmedLine.startsWith('data: ')) {
              const dataStr = trimmedLine.slice(6).trim()
              if (dataStr && dataStr !== '[DONE]') {
                try {
                  const data = JSON.parse(dataStr)
                  console.log('📄 Parsed SSE data:', data)
                  console.log('📄 Content type:', typeof data.content, data.content)
                  
                  if (data.done) {
                    console.log('🏁 Stream marked as done')
                    break
                  }
                  
                  if (data.error) {
                    console.error('❌ Stream error:', data.error)
                    throw new Error(data.error)
                  }
                  
                  if (data.content) {
                    let contentText = ''
                    
                    // Handle different content formats from Replicate
                    if (typeof data.content === 'string') {
                      contentText = data.content
                    } else if (typeof data.content === 'object' && data.content !== null) {
                      // If content is an object, try to extract text from it
                      if (data.content.content && typeof data.content.content === 'string') {
                        contentText = data.content.content
                      } else if (data.content.text && typeof data.content.text === 'string') {
                        contentText = data.content.text
                      } else {
                        // Try to stringify the object
                        contentText = JSON.stringify(data.content)
                      }
                    }
                    
                    if (contentText) {
                      assistantMessage += contentText
                      const tempMessages = [...newMessages, {
                        id: 'temp-assistant',
                        content: assistantMessage,
                        role: 'assistant' as const,
                        timestamp: new Date()
                      }]
                      setMessages(tempMessages)
                    }
                  }
                } catch (e) {
                  console.warn('⚠️ Failed to parse SSE data:', dataStr, e)
                }
              }
            }
          }
        }
      } else {
        console.error('❌ No response body reader available')
        throw new Error('No response body available')
      }

      // Save assistant message to database
      let finalAssistantMessage: Message
      
      if (currentConversationId.startsWith('temp-')) {
        // Use temporary message for fallback
        console.log('📝 Using temporary assistant message (no database)')
        finalAssistantMessage = {
          id: 'temp-assistant-' + Date.now(),
          content: assistantMessage || 'I apologize, but I couldn\'t generate a response. Please try again.',
          role: 'assistant',
          timestamp: new Date()
        }
      } else {
        const { data: assistantMessageData, error: assistantMessageError } = await supabase
          .from('project_messages')
          .insert({
            conversation_id: currentConversationId,
            project_id: projectId,
            user_id: user.id,
            role: 'assistant',
            content: assistantMessage || 'I apologize, but I couldn\'t generate a response. Please try again.'
          })
          .select()
          .single()

        if (assistantMessageError) {
          console.error('❌ Error saving assistant message:', assistantMessageError)
          
          // If table doesn't exist, use temporary message
          if (assistantMessageError.message.includes('relation "public.project_messages" does not exist')) {
            console.log('⚠️ project_messages table does not exist, using temporary assistant message')
            finalAssistantMessage = {
              id: 'temp-assistant-' + Date.now(),
              content: assistantMessage || 'I apologize, but I couldn\'t generate a response. Please try again.',
              role: 'assistant',
              timestamp: new Date()
            }
          } else {
            throw assistantMessageError
          }
        } else {
          finalAssistantMessage = {
            id: assistantMessageData.id,
            content: assistantMessageData.content,
            role: 'assistant',
            timestamp: new Date(assistantMessageData.created_at)
          }
        }
      }

      const finalMessages = [...newMessages, finalAssistantMessage]
      setMessages(finalMessages)

      // Update conversation updated_at
      if (!currentConversationId.startsWith('temp-')) {
        try {
          await supabase
            .from('project_conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', currentConversationId)
        } catch (error) {
          console.error('❌ Error updating conversation timestamp:', error)
          // Continue without updating timestamp
        }
      }

    } catch (error) {
      console.error('Error in project chat:', error)
      const errorMessage: Message = {
        id: 'error-' + Date.now(),
        content: 'Sorry, I encountered an error. Please try again.',
        role: 'assistant',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFileIcon = (fileType: string) => {
    return <FileText className="w-4 h-4 text-blue-500" />
  }

  if (!user || !project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading project...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-50 flex">
      {/* Left Sidebar - Conversations */}
      <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 bg-gray-900 text-white flex flex-col overflow-hidden`}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => router.push('/projects')}
              className="p-1 hover:bg-gray-800 rounded transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold truncate">{project.name}</h1>
              <p className="text-xs text-gray-400 truncate">
                {project.document_count} documents
              </p>
            </div>
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
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
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
                {conversations.find(c => c.id === currentConversationId)?.title || project.name}
              </h1>
              <p className="text-sm text-gray-500">Project Knowledge Base</p>
            </div>
          </div>
          
          <button
            onClick={() => setDocumentsOpen(!documentsOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {documentsOpen ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
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
                  Chat with Your Project
                </h2>
                <p className="text-gray-600 leading-relaxed">
                  Ask questions about your documents. I have access to all {project.document_count} documents 
                  in this project and can help you find information, summarize content, or answer specific questions.
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
                          <span className="text-gray-500">Analyzing your documents...</span>
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
                    placeholder={`Ask questions about your ${project.document_count} documents...`}
                    className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent max-h-32"
                    style={{ minHeight: '50px' }}
                    disabled={loading}
                  />
                  <button
                    onClick={(e) => {
                      console.log('🖱️ Send button clicked!', {
                        loading,
                        hasInput: !!inputMessage.trim(),
                        disabled: loading || !inputMessage.trim()
                      })
                      e.preventDefault()
                      handleSendMessage()
                    }}
                    disabled={loading || !inputMessage.trim()}
                    className="absolute right-2 bottom-2 w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-colors"
                  >
                    <Send className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-500 text-center">
              Ask questions about your documents. AI responses are based on your uploaded content.
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Documents */}
      <div className={`${documentsOpen ? 'w-80' : 'w-0'} transition-all duration-300 bg-white border-l border-gray-200 flex flex-col overflow-hidden`}>
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Documents</h3>
          <p className="text-sm text-gray-500">{documents.length} files uploaded</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {documents.map((document) => (
            <div
              key={document.id}
              className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
              onClick={() => setSelectedDocument(document)}
            >
              <div className="flex items-start gap-3">
                {getFileIcon(document.file_type)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {document.original_filename}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(document.file_size)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {document.text_length.toLocaleString()} characters extracted
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedDocument(document)
                      setDocumentPreview(true)
                    }}
                    className="p-1 hover:bg-gray-200 rounded"
                    title="Preview"
                  >
                    <Eye className="w-4 h-4 text-gray-400" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      window.open(document.file_url, '_blank')
                    }}
                    className="p-1 hover:bg-gray-200 rounded"
                    title="Download"
                  >
                    <Download className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          {documents.length === 0 && (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No documents uploaded</p>
            </div>
          )}
        </div>
      </div>

      {/* Document Preview Modal */}
      {documentPreview && selectedDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl max-h-[90vh] w-full flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 truncate">
                {selectedDocument.original_filename}
              </h3>
              <button
                onClick={() => setDocumentPreview(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 p-4 overflow-y-auto">
              <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
                {selectedDocument.extracted_text || 'No text content available'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
