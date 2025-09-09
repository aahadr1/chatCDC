'use client';

import React from 'react';
import { Message } from '@/types/chat';
import { ThumbsUp, ThumbsDown, Copy, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface ChatMessageProps {
  message: Message;
  onFeedback: (messageId: string, feedback: 'up' | 'down') => void;
  onCopy: (content: string) => void;
  onRegenerate?: (messageId: string) => void;
}

export default function ChatMessage({ 
  message, 
  onFeedback, 
  onCopy, 
  onRegenerate 
}: ChatMessageProps) {
  const isUser = message.role === 'user';
  
  if (message.isTyping) {
    return (
      <div className="flex justify-start mb-6">
        <div className="message-bubble assistant-message">
          <div className="typing-indicator flex gap-1">
            <span className="w-2 h-2 bg-apple-gray-400 rounded-full"></span>
            <span className="w-2 h-2 bg-apple-gray-400 rounded-full"></span>
            <span className="w-2 h-2 bg-apple-gray-400 rounded-full"></span>
          </div>
        </div>
      </div>
    );
  }

  const markdownComponents = {
    // on tape le paramètre en any pour récupérer "inline"
    code({ node, inline, className, children, ...props }: any) {
      return inline ? (
        <code className="bg-apple-gray-200 px-1 py-0.5 rounded text-sm" {...props}>
          {children}
        </code>
      ) : (
        <pre className="overflow-auto rounded-lg p-3">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      );
    },
    table({ children, ...props }) {
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse" {...props}>
            {children}
          </table>
        </div>
      );
    },
  } satisfies Components;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-6 group`}>
      <div className={`message-bubble ${isUser ? 'user-message' : 'assistant-message'}`}>
        {/* Message Images */}
        {message.images && message.images.length > 0 && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            {message.images.map((image, index) => (
              <img
                key={index}
                src={image}
                alt={`Uploaded image ${index + 1}`}
                className="rounded-lg max-w-full h-auto"
              />
            ))}
          </div>
        )}
        
        {/* Message Content */}
        <div className="prose prose-sm max-w-none">
          {isUser ? (
            <p className="text-white m-0 whitespace-pre-wrap">{message.content}</p>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              className="text-apple-gray-900 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              components={markdownComponents}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>

        {/* Message Actions (only for assistant messages) */}
        {!isUser && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-apple-gray-200 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onFeedback(message.id, 'up')}
                className={`p-1.5 rounded-lg transition-colors duration-200 ${
                  message.feedback === 'up'
                    ? 'bg-apple-green-500 text-white'
                    : 'hover:bg-apple-gray-200 text-apple-gray-600'
                }`}
              >
                <ThumbsUp size={14} />
              </button>
              <button
                onClick={() => onFeedback(message.id, 'down')}
                className={`p-1.5 rounded-lg transition-colors duration-200 ${
                  message.feedback === 'down'
                    ? 'bg-apple-red-500 text-white'
                    : 'hover:bg-apple-gray-200 text-apple-gray-600'
                }`}
              >
                <ThumbsDown size={14} />
              </button>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => onCopy(message.content)}
                className="p-1.5 rounded-lg hover:bg-apple-gray-200 text-apple-gray-600 transition-colors duration-200"
                title="Copy message"
              >
                <Copy size={14} />
              </button>
              {onRegenerate && (
                <button
                  onClick={() => onRegenerate(message.id)}
                  className="p-1.5 rounded-lg hover:bg-apple-gray-200 text-apple-gray-600 transition-colors duration-200"
                  title="Regenerate response"
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
