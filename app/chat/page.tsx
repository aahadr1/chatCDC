'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  MessageCircle, Plus, Trash2, Upload, Send, Settings, 
  PanelLeftClose, PanelLeft, Search, MoreHorizontal,
  Sparkles, Image, FileText, X, ChevronDown, Globe,
  Brain, Keyboard, Moon, Sun, Zap
} from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { FilePreview } from '@/components/chat/FilePreview'
import { PromptTemplates, parseSlashCommand, getPromptFromCommand } from '@/components/chat/PromptTemplates'
import { SettingsPanel, type ChatSettings } from '@/components/chat/SettingsPanel'
import { buildFileContext, createFilePreview, MAX_FILES_PER_MESSAGE } from '@/lib/fileProcessor'
import { buildMemoryContext, parseRememberCommand } from '@/lib/memory'

// Fixed UUID for anonymous users (consistent across sessions)
const ANONYMOUS_USER_ID = '00000000-0000-0000-0000-000000000000'

interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  created_at: string
  feedback?: 'up' | 'down' | null
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
  preview?: string
  content?: string
}

interface Memory {
  id: string
  content: string
  created_at: string
}

// Generate initial conversation synchronously to fix the send bug
function createInitialConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: 'New Chat',
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date()
  }
}

export default function ChatPage() {
  // Initialize with conversation immediately to fix send bug
  const [initialConversation] = useState<Conversation>(createInitialConversation)
  const [conversations, setConversations] = useState<Conversation[]>([initialConversation])
  const [currentConversationId, setCurrentConversationId] = useState<string>(initialConversation.id)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [showPrompts, setShowPrompts] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [memories, setMemories] = useState<Memory[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  
  const [settings, setSettings] = useState<ChatSettings>({
    verbosity: 'medium',
    reasoningEffort: 'medium',
    enableWebSearch: false,
    maxTokens: 4000
  })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load conversations from Supabase
  useEffect(() => {
    async function loadConversations() {
      try {
        const { data, error } = await supabase
          .from('conversations')
          .select('*')
          .eq('user_id', ANONYMOUS_USER_ID)
          .order('updated_at', { ascending: false })
          .limit(50)

        if (error) {
          console.warn('Could not load conversations:', error.message)
          return
        }

        if (data && data.length > 0) {
          const loadedConvs = data.map(c => ({
            id: c.id,
            title: c.title,
            messages: [],
            createdAt: new Date(c.created_at),
            updatedAt: new Date(c.updated_at)
          }))
          setConversations(prev => {
            // Merge with existing, keeping the initial conversation
            const existing = new Set(loadedConvs.map(c => c.id))
            const unique = prev.filter(c => !existing.has(c.id))
            return [...loadedConvs, ...unique]
          })
        }
      } catch (err) {
        console.warn('Error loading conversations:', err)
      }
    }
    loadConversations()
  }, [])

  // Load messages when switching conversations
  useEffect(() => {
    async function loadMessages() {
      if (!currentConversationId) return
      
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', currentConversationId)
          .order('created_at', { ascending: true })

        if (error) {
          console.warn('Could not load messages:', error.message)
          return
        }

        if (data) {
          setMessages(data.map(m => ({
            id: m.id,
            content: m.content,
            role: m.role,
            created_at: m.created_at,
            feedback: m.feedback
          })))
        }
      } catch (err) {
        console.warn('Error loading messages:', err)
      }
    }
    loadMessages()
  }, [currentConversationId])

  // Load user memories
  useEffect(() => {
    async function loadMemories() {
      try {
        const { data, error } = await supabase
          .from('user_memories')
          .select('*')
          .eq('user_id', ANONYMOUS_USER_ID)
          .order('created_at', { ascending: false })
          .limit(20)

        if (error) {
          // Table might not exist yet - this is okay
          console.warn('Could not load memories:', error.message)
          return
        }

        if (data) {
          setMemories(data)
        }
      } catch (err) {
        console.warn('Error loading memories:', err)
      }
    }
    loadMemories()
  }, [])

  // Filter conversations by search
  const filteredConversations = useMemo(() => {
    if (!searchQuery) return conversations
    return conversations.filter(c => 
      c.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [conversations, searchQuery])

  // Group conversations by date
  const groupedConversations = useMemo(() => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const lastWeek = new Date(today)
    lastWeek.setDate(lastWeek.getDate() - 7)

    const groups: { label: string; conversations: Conversation[] }[] = [
      { label: 'Today', conversations: [] },
      { label: 'Yesterday', conversations: [] },
      { label: 'Last 7 days', conversations: [] },
      { label: 'Older', conversations: [] },
    ]

    filteredConversations.forEach(conv => {
      const date = conv.updatedAt
      if (date.toDateString() === today.toDateString()) {
        groups[0].conversations.push(conv)
      } else if (date.toDateString() === yesterday.toDateString()) {
        groups[1].conversations.push(conv)
      } else if (date > lastWeek) {
        groups[2].conversations.push(conv)
      } else {
        groups[3].conversations.push(conv)
      }
    })

    return groups.filter(g => g.conversations.length > 0)
  }, [filteredConversations])

  const createNewConversation = useCallback(async () => {
    const newConversation: Conversation = {
      id: crypto.randomUUID(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    // Try to save to database, but don't block if it fails
    try {
      await supabase.from('conversations').insert({
        id: newConversation.id,
        title: newConversation.title,
        user_id: ANONYMOUS_USER_ID,
        created_at: newConversation.createdAt.toISOString(),
        updated_at: newConversation.updatedAt.toISOString()
      })
    } catch (err) {
      console.warn('Could not save conversation to database:', err)
    }

    setConversations(prev => [newConversation, ...prev])
    setCurrentConversationId(newConversation.id)
    setMessages([])
    setUploadedFiles([])
  }, [])

  const switchConversation = useCallback((conversationId: string) => {
    setCurrentConversationId(conversationId)
    setUploadedFiles([])
  }, [])

  const deleteConversation = useCallback(async (conversationId: string) => {
    // Try to delete from database
    try {
      await supabase.from('conversations').delete().eq('id', conversationId)
    } catch (err) {
      console.warn('Could not delete conversation from database:', err)
    }
    
    setConversations(prev => prev.filter(c => c.id !== conversationId))
    
    if (currentConversationId === conversationId) {
      const remaining = conversations.filter(c => c.id !== conversationId)
      if (remaining.length > 0) {
        setCurrentConversationId(remaining[0].id)
      } else {
        createNewConversation()
      }
    }
  }, [currentConversationId, conversations, createNewConversation])

  // Handle file upload
  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    
    if (uploadedFiles.length + fileArray.length > MAX_FILES_PER_MESSAGE) {
      alert(`Maximum ${MAX_FILES_PER_MESSAGE} files allowed`)
      return
    }

    setIsUploading(true)

    for (const file of fileArray) {
      try {
        // Create preview for images
        const preview = await createFilePreview(file)
        
        // Read content for text files
        let content = null
        if (file.type.startsWith('text/') || file.type === 'application/json') {
          content = await file.text()
        }

        const newFile: UploadedFile = {
          id: crypto.randomUUID(),
          file_name: file.name,
          file_url: URL.createObjectURL(file),
          file_size: file.size,
          file_type: file.type,
          preview: preview || undefined,
          content: content || undefined
        }

        setUploadedFiles(prev => [...prev, newFile])
      } catch (error) {
        console.error('Error processing file:', error)
      }
    }

    setIsUploading(false)
  }, [uploadedFiles])

  const removeUploadedFile = useCallback((fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId))
  }, [])

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files)
    }
  }, [handleFileUpload])

  // Handle input changes with slash command detection
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInputMessage(value)
    
    // Show prompt templates when typing /
    if (value === '/') {
      setShowPrompts(true)
    } else if (!value.startsWith('/')) {
      setShowPrompts(false)
    }
  }, [])

  // Handle prompt selection
  const handlePromptSelect = useCallback((prompt: string) => {
    setInputMessage(prompt)
    setShowPrompts(false)
    inputRef.current?.focus()
  }, [])

  // Send message
  const handleSendMessage = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    
    if (!inputMessage.trim() || loading) return

    const messageContent = inputMessage.trim()
    
    // Check for remember command
    const rememberContent = parseRememberCommand(messageContent)
    if (rememberContent) {
      const memoryId = crypto.randomUUID()
      // Try to save to database
      try {
        await supabase.from('user_memories').insert({
          id: memoryId,
          user_id: ANONYMOUS_USER_ID,
          content: rememberContent,
          created_at: new Date().toISOString()
        })
      } catch (err) {
        console.warn('Could not save memory to database:', err)
      }
      
      setMemories(prev => [{ id: memoryId, content: rememberContent, created_at: new Date().toISOString() }, ...prev])
      setInputMessage('')
      
      // Add confirmation message
      const confirmMessage: Message = {
        id: crypto.randomUUID(),
        content: `I'll remember that: "${rememberContent}"`,
        role: 'assistant',
        created_at: new Date().toISOString()
      }
      setMessages(prev => [...prev, confirmMessage])
      return
    }

    // Check for slash command
    const slashCommand = parseSlashCommand(messageContent)
    let finalContent = messageContent
    
    if (slashCommand) {
      const promptTemplate = getPromptFromCommand(slashCommand.command)
      if (promptTemplate) {
        finalContent = promptTemplate + slashCommand.args
      }
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      content: finalContent,
      role: 'user',
      created_at: new Date().toISOString()
    }

    // Try to save user message to database
    try {
      await supabase.from('messages').insert({
        id: userMessage.id,
        conversation_id: currentConversationId,
        user_id: ANONYMOUS_USER_ID,
        role: 'user',
        content: finalContent,
        created_at: userMessage.created_at
      })
    } catch (err) {
      console.warn('Could not save message to database:', err)
    }

    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInputMessage('')
    setLoading(true)

    // Build contexts
    const fileContext = buildFileContext(uploadedFiles.map(f => ({
      id: f.id,
      file_name: f.file_name,
      file_url: f.file_url,
      file_size: f.file_size,
      file_type: f.file_type,
      content: f.content
    })))
    
    const memoryContext = buildMemoryContext(
      memories.map(m => ({ ...m, user_id: ANONYMOUS_USER_ID })),
      []
    )

    // Get image URLs for vision
    const imageUrls = uploadedFiles
      .filter(f => f.file_type.startsWith('image/'))
      .map(f => f.file_url)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          conversationId: currentConversationId,
          userId: ANONYMOUS_USER_ID,
          settings: {
            ...settings,
            imageUrls: imageUrls.length > 0 ? imageUrls : undefined
          },
          fileContext,
          memoryContext
        }),
      })

      if (!response.ok) throw new Error('Failed to get response')

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let assistantMessage = ''
      const assistantId = crypto.randomUUID()

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
                  setMessages([...newMessages, {
                    id: assistantId,
                    content: assistantMessage,
                    role: 'assistant',
                    created_at: new Date().toISOString()
                  }])
                }
                if (data.done) break
              } catch (e) {
                // Ignore parsing errors
              }
            }
          }
        }
      }

      // Final update
      setMessages([...newMessages, {
        id: assistantId,
        content: assistantMessage || 'I apologize, but I was unable to generate a response.',
        role: 'assistant',
        created_at: new Date().toISOString()
      }])

      // Clear uploaded files after sending
      setUploadedFiles([])

    } catch (error) {
      console.error('Error:', error)
      setMessages([...newMessages, {
        id: crypto.randomUUID(),
        content: 'Sorry, I encountered an error. Please try again.',
        role: 'assistant',
        created_at: new Date().toISOString()
      }])
    } finally {
      setLoading(false)
    }
  }, [inputMessage, loading, messages, currentConversationId, uploadedFiles, settings, memories])

  // Regenerate response
  const handleRegenerate = useCallback(async (messageIndex: number) => {
    const messagesUntilHere = messages.slice(0, messageIndex)
    setMessages(messagesUntilHere)
    
    // Get the last user message
    const lastUserMessage = [...messagesUntilHere].reverse().find(m => m.role === 'user')
    if (lastUserMessage) {
      setInputMessage(lastUserMessage.content)
      // Remove the last user message and resend
      setMessages(messagesUntilHere.slice(0, -1))
      setTimeout(() => {
        handleSendMessage()
      }, 100)
    }
  }, [messages, handleSendMessage])

  // Edit message
  const handleEditMessage = useCallback((messageId: string, content: string) => {
    setEditingMessageId(messageId)
    setEditContent(content)
  }, [])

  const submitEdit = useCallback(async () => {
    if (!editingMessageId || !editContent.trim()) return
    
    const messageIndex = messages.findIndex(m => m.id === editingMessageId)
    if (messageIndex === -1) return

    // Update message and remove all following messages
    const updatedMessages = messages.slice(0, messageIndex)
    setMessages(updatedMessages)
    setInputMessage(editContent)
    setEditingMessageId(null)
    setEditContent('')
    
    setTimeout(() => {
      handleSendMessage()
    }, 100)
  }, [editingMessageId, editContent, messages, handleSendMessage])

  // Handle feedback
  const handleFeedback = useCallback(async (messageId: string, feedback: 'up' | 'down') => {
    // Try to save feedback to database
    try {
      await supabase
        .from('messages')
        .update({ feedback })
        .eq('id', messageId)
    } catch (err) {
      console.warn('Could not save feedback:', err)
    }
    
    setMessages(prev => prev.map(m => 
      m.id === messageId ? { ...m, feedback } : m
    ))
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Enter to send
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSendMessage()
      }
      
      // Cmd/Ctrl + N for new chat
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        createNewConversation()
      }
      
      // Cmd/Ctrl + B to toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        setSidebarOpen(prev => !prev)
      }
      
      // Escape to close modals
      if (e.key === 'Escape') {
        setShowPrompts(false)
        setShowSettings(false)
        setEditingMessageId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSendMessage, createNewConversation])

  return (
    <div 
      className="h-screen bg-zinc-950 flex overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-zinc-900/90 backdrop-blur-sm flex items-center justify-center"
          >
            <div className="text-center">
              <Upload className="w-16 h-16 text-zinc-400 mx-auto mb-4" />
              <p className="text-xl text-zinc-300">Drop files here</p>
              <p className="text-sm text-zinc-500 mt-1">Up to {MAX_FILES_PER_MESSAGE} files</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full bg-zinc-900 border-r border-zinc-800 flex flex-col overflow-hidden"
          >
            {/* Sidebar Header */}
            <div className="p-4 border-b border-zinc-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                    <Zap className="w-4 h-4 text-zinc-900" />
                  </div>
                  <span className="font-semibold text-zinc-100">ChatCDC</span>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
              
              <button
                onClick={createNewConversation}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-zinc-900 rounded-lg font-medium hover:bg-zinc-200 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Chat
              </button>
            </div>

            {/* Search */}
            <div className="p-3 border-b border-zinc-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search conversations..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                />
              </div>
            </div>

            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
              {groupedConversations.map((group) => (
                <div key={group.label} className="mb-4">
                  <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-3 py-2">
                    {group.label}
                  </h3>
                  {group.conversations.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => switchConversation(conv.id)}
                      className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                        currentConversationId === conv.id 
                          ? 'bg-zinc-800 text-white' 
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                      }`}
                    >
                      <MessageCircle className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1 text-sm truncate">{conv.title}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteConversation(conv.id)
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-700 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-zinc-500 hover:text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Sidebar Footer */}
            <div className="p-3 border-t border-zinc-800">
              <button
                onClick={() => setShowSettings(true)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <PanelLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">
                {conversations.find(c => c.id === currentConversationId)?.title || 'New Chat'}
              </h1>
              <p className="text-xs text-zinc-500">{messages.length} messages</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {settings.enableWebSearch && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-800 rounded-full text-xs text-zinc-400">
                <Globe className="w-3 h-3" />
                Web
              </div>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-3xl mx-auto px-4 py-6">
            {messages.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-20"
              >
                <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-zinc-700">
                  <Sparkles className="w-8 h-8 text-zinc-400" />
                </div>
                <h2 className="text-2xl font-semibold text-zinc-100 mb-2">
                  How can I help you today?
                </h2>
                <p className="text-zinc-500 max-w-md mx-auto mb-8">
                  Ask me anything, upload files for analysis, or use slash commands for quick actions.
                </p>
                
                {/* Quick actions */}
                <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                  {[
                    { icon: FileText, label: 'Summarize text', prompt: '/summarize ' },
                    { icon: Brain, label: 'Explain concept', prompt: '/explain ' },
                    { icon: Sparkles, label: 'Brainstorm ideas', prompt: '/brainstorm ' },
                    { icon: Keyboard, label: 'Review code', prompt: '/code ' },
                  ].map((action) => (
                    <button
                      key={action.label}
                      onClick={() => {
                        setInputMessage(action.prompt)
                        inputRef.current?.focus()
                      }}
                      className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-left hover:border-zinc-700 hover:bg-zinc-800/50 transition-all group"
                    >
                      <action.icon className="w-5 h-5 text-zinc-500 group-hover:text-zinc-300" />
                      <span className="text-sm text-zinc-400 group-hover:text-zinc-200">{action.label}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <div className="space-y-6">
                {messages.map((message, index) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onCopy={() => {}}
                    onEdit={message.role === 'user' ? () => handleEditMessage(message.id, message.content) : undefined}
                    onRegenerate={message.role === 'assistant' ? () => handleRegenerate(index) : undefined}
                    onFeedback={message.role === 'assistant' ? (fb) => handleFeedback(message.id, fb) : undefined}
                    isStreaming={loading && index === messages.length - 1 && message.role === 'assistant'}
                  />
                ))}
                
                {loading && messages[messages.length - 1]?.role === 'user' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-4"
                  >
                    <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                      <Brain className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div className="flex-1">
                      <div className="message-assistant px-4 py-3 inline-block">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <div className="typing-dot" />
                            <div className="typing-dot" />
                            <div className="typing-dot" />
                          </div>
                          <span className="text-sm text-zinc-500">Thinking...</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
                
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t border-zinc-800 bg-zinc-950">
          <div className="max-w-3xl mx-auto px-4 py-4">
            {/* File Preview */}
            {uploadedFiles.length > 0 && (
              <div className="mb-3">
                <FilePreview 
                  files={uploadedFiles} 
                  onRemove={removeUploadedFile}
                  isCompact
                />
              </div>
            )}

            {/* Edit mode */}
            {editingMessageId && (
              <div className="mb-3 p-3 bg-zinc-900 border border-zinc-700 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-zinc-400">Editing message</span>
                  <button 
                    onClick={() => setEditingMessageId(null)}
                    className="text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-600 resize-none"
                  rows={3}
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button 
                    onClick={() => setEditingMessageId(null)}
                    className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={submitEdit}
                    className="px-3 py-1.5 text-sm bg-white text-zinc-900 rounded-lg hover:bg-zinc-200"
                  >
                    Save & Send
                  </button>
                </div>
              </div>
            )}

            {/* Input form */}
            <form onSubmit={handleSendMessage} className="relative">
              {/* Prompt templates popup */}
              <PromptTemplates 
                isOpen={showPrompts} 
                onClose={() => setShowPrompts(false)}
                onSelect={handlePromptSelect}
              />

              <div className="flex items-end gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-2xl focus-within:border-zinc-700 transition-colors">
                {/* File upload button */}
                <input
                  type="file"
                  ref={fileInputRef}
                  multiple
                  accept="image/*,.pdf,.txt,.md,.csv,.json"
                  onChange={(e) => {
                    if (e.target.files) handleFileUpload(e.target.files)
                    e.target.value = ''
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || uploadedFiles.length >= MAX_FILES_PER_MESSAGE}
                  className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  {isUploading ? (
                    <div className="w-5 h-5 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Upload className="w-5 h-5" />
                  )}
                </button>

                {/* Textarea */}
                <textarea
                  ref={inputRef}
                  value={inputMessage}
                  onChange={handleInputChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  placeholder="Message ChatCDC... (/ for commands)"
                  rows={1}
                  className="flex-1 bg-transparent text-zinc-100 placeholder:text-zinc-500 focus:outline-none resize-none min-h-[24px] max-h-32"
                  style={{ height: 'auto' }}
                />

                {/* Send button */}
                <button
                  type="submit"
                  disabled={loading || (!inputMessage.trim() && uploadedFiles.length === 0)}
                  className="p-2 rounded-lg bg-white text-zinc-900 hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:hover:bg-white"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>

              {/* Keyboard shortcut hint */}
              <p className="text-center text-xs text-zinc-600 mt-2">
                Press <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">⌘</kbd> + <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">Enter</kbd> to send
              </p>
            </form>
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      <SettingsPanel 
        settings={settings}
        onSettingsChange={setSettings}
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  )
}
