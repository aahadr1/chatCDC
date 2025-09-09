'use client';

import React, { useRef, useEffect } from 'react';
import { Message } from '@/types/chat';
import ChatMessage from './ChatMessage';

interface ChatWindowProps {
  messages: Message[];
  isLoading: boolean;
  onFeedback: (messageId: string, feedback: 'up' | 'down') => void;
  onCopy: (content: string) => void;
  onRegenerate?: (messageId: string) => void;
}

export default function ChatWindow({
  messages,
  isLoading,
  onFeedback,
  onCopy,
  onRegenerate,
}: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-apple-gray-50 to-white">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-24 h-24 bg-gradient-to-br from-apple-blue-500 to-apple-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <svg
              className="w-12 h-12 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          
          <h2 className="text-2xl font-bold text-apple-gray-900 mb-3">
            Welcome to ChatCDC
          </h2>
          
          <p className="text-apple-gray-600 mb-6 leading-relaxed">
            Your intelligent AI assistant powered by GPT-5. Ask me anything, upload images, 
            or start a conversation to explore the possibilities.
          </p>
          
          <div className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-apple-gray-100">
              <div className="w-8 h-8 bg-apple-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-apple-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-apple-gray-700">Advanced reasoning capabilities</span>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-apple-gray-100">
              <div className="w-8 h-8 bg-apple-green-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-apple-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-apple-gray-700">Image analysis and understanding</span>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-apple-gray-100">
              <div className="w-8 h-8 bg-apple-red-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-apple-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-apple-gray-700">Code generation and debugging</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-apple-gray-50 to-white">
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6"
      >
        <div className="max-w-4xl mx-auto">
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              onFeedback={onFeedback}
              onCopy={onCopy}
              onRegenerate={onRegenerate}
            />
          ))}
          
          {isLoading && (
            <ChatMessage
              message={{
                id: 'typing',
                role: 'assistant',
                content: '',
                timestamp: new Date(),
                isTyping: true,
              }}
              onFeedback={() => {}}
              onCopy={() => {}}
            />
          )}
        </div>
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
