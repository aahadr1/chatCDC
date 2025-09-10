'use client'

import { useState } from 'react'
import { MessageCircle } from 'lucide-react'

interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  created_at: string
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputMessage.trim() || loading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      role: 'user',
      created_at: new Date().toISOString()
    }

    setMessages(prev => [...prev, userMessage])
    setInputMessage('')
    setLoading(true)

    // Simulate AI response (replace with actual AI integration)
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `I received your message: "${inputMessage}". This is a placeholder response. In a real implementation, this would connect to your AI service.`,
        role: 'assistant',
        created_at: new Date().toISOString()
      }
      setMessages(prev => [...prev, aiMessage])
      setLoading(false)
    }, 1000)
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-apple-gray-50 to-white">
      {/* Header */}
      <header className="bg-white border-b border-apple-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-apple-blue-500 to-apple-blue-600 rounded-xl flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-apple-gray-900">ChatCDC</h1>
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

      {/* Chat Area */}
      <div className="flex-1 flex flex-col max-w-4xl mx-auto h-[calc(100vh-80px)]">
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
