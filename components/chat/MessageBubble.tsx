'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Check, RefreshCw, Edit3, ThumbsUp, ThumbsDown, User, Bot, FileText, Image as ImageIcon, File } from 'lucide-react'
import { CodeBlock } from './CodeBlock'

interface MessageFile {
  id: string
  file_name: string
  file_url: string
  file_type: string
  preview?: string
}

interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  created_at: string
  feedback?: 'up' | 'down' | null
  files?: MessageFile[]
}

interface MessageBubbleProps {
  message: Message
  onCopy?: () => void
  onEdit?: () => void
  onRegenerate?: () => void
  onFeedback?: (feedback: 'up' | 'down') => void
  isStreaming?: boolean
}

export function MessageBubble({ 
  message, 
  onCopy, 
  onEdit, 
  onRegenerate,
  onFeedback,
  isStreaming 
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'
  const hasFiles = message.files && message.files.length > 0

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    onCopy?.()
  }

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return ImageIcon
    if (type === 'application/pdf') return FileText
    return File
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`group flex gap-4 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
        isUser ? 'bg-white' : 'bg-zinc-800 border border-zinc-700'
      }`}>
        {isUser ? (
          <User className="w-4 h-4 text-zinc-900" />
        ) : (
          <Bot className="w-4 h-4 text-zinc-300" />
        )}
      </div>

      {/* Message Content */}
      <div className={`flex-1 max-w-[85%] ${isUser ? 'flex flex-col items-end' : ''}`}>
        {/* Attached Files (shown above message for user) */}
        {isUser && hasFiles && (
          <div className="mb-2 flex flex-wrap gap-2 justify-end">
            {message.files!.map((file) => {
              const Icon = getFileIcon(file.file_type)
              const isImage = file.file_type.startsWith('image/')
              
              return (
                <div
                  key={file.id}
                  className="relative group/file"
                >
                  {isImage && file.preview ? (
                    <a 
                      href={file.file_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <img 
                        src={file.preview} 
                        alt={file.file_name}
                        className="w-32 h-32 object-cover rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-2 py-1 rounded-b-lg truncate">
                        {file.file_name}
                      </div>
                    </a>
                  ) : (
                    <a
                      href={file.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg hover:border-zinc-500 transition-colors"
                    >
                      <Icon className="w-4 h-4 text-zinc-400" />
                      <span className="text-xs text-zinc-300 max-w-24 truncate">{file.file_name}</span>
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className={`${isUser ? 'message-user' : 'message-assistant'} px-4 py-3`}>
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm">{message.content}</p>
          ) : (
            <div className="prose-chat">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '')
                    const language = match ? match[1] : ''
                    
                    if (!inline && language) {
                      return (
                        <CodeBlock 
                          code={String(children).replace(/\n$/, '')} 
                          language={language} 
                        />
                      )
                    }
                    
                    return (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    )
                  },
                  pre({ children }) {
                    return <>{children}</>
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
              
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-zinc-400 animate-pulse ml-0.5" />
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className={`flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity ${
          isUser ? 'flex-row-reverse' : ''
        }`}>
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            title="Copy"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          
          {isUser && onEdit && (
            <button
              onClick={onEdit}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="Edit"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
          
          {!isUser && (
            <>
              {onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                  title="Regenerate"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
              
              {onFeedback && (
                <>
                  <button
                    onClick={() => onFeedback('up')}
                    className={`p-1.5 rounded-md transition-colors ${
                      message.feedback === 'up' 
                        ? 'text-emerald-400 bg-emerald-400/10' 
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                    }`}
                    title="Good response"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onFeedback('down')}
                    className={`p-1.5 rounded-md transition-colors ${
                      message.feedback === 'down' 
                        ? 'text-red-400 bg-red-400/10' 
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                    }`}
                    title="Bad response"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}
