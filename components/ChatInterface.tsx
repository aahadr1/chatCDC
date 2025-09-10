'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ChatWindow from '@/components/ChatWindow';
import ChatInput from '@/components/ChatInput';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  feedback?: 'up' | 'down' | null;
  timestamp: Date;
  isTyping?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

interface ConversationWithMessages {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    images?: string[];
    feedback?: 'up' | 'down' | null;
    created_at: string;
  }>;
}

interface ChatSettings {
  model: string;
  verbosity: 'minimal' | 'medium' | 'verbose';
  reasoningEffort: 'minimal' | 'medium' | 'high';
  enableWebSearch: boolean;
  maxTokens?: number;
}

const defaultSettings: ChatSettings = {
  model: 'gpt-5',
  verbosity: 'medium',
  reasoningEffort: 'minimal',
  enableWebSearch: false,
};

interface ChatInterfaceProps {
  initialConversations: ConversationWithMessages[];
  initialConversationId?: string;
}

export default function ChatInterface({ initialConversations, initialConversationId }: ChatInterfaceProps) {
  const router = useRouter();
  
  // Convert server data to client format
  const [conversations, setConversations] = useState<Conversation[]>(
    initialConversations.map(conv => ({
      id: conv.id,
      title: conv.title,
      createdAt: new Date(conv.created_at),
      updatedAt: new Date(conv.updated_at),
      messages: conv.messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        images: msg.images || undefined,
        feedback: msg.feedback || undefined,
        timestamp: new Date(msg.created_at),
      }))
    }))
  );

  const [currentConversationId, setCurrentConversationId] = useState<string | null>(
    initialConversationId || (initialConversations.length > 0 ? initialConversations[0].id : null)
  );
  const [settings, setSettings] = useState<ChatSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResponseId, setLastResponseId] = useState<string | null>(null);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('chatcdc-settings');
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    }
  }, []);

  // Save settings to localStorage
  const saveSettings = useCallback((settings: ChatSettings) => {
    localStorage.setItem('chatcdc-settings', JSON.stringify(settings));
  }, []);

  const getCurrentConversation = useCallback(() => {
    return conversations.find(conv => conv.id === currentConversationId) || null;
  }, [conversations, currentConversationId]);

  const generateTitle = useCallback((message: string) => {
    const words = message.split(' ').slice(0, 6);
    return words.join(' ') + (message.split(' ').length > 6 ? '...' : '');
  }, []);

  const handleNewChat = useCallback(async () => {
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'New Chat'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create conversation');
      }

      const data = await response.json();
      const newConversation: Conversation = {
        id: data.conversation.id,
        title: data.conversation.title,
        messages: [],
        createdAt: new Date(data.conversation.created_at),
        updatedAt: new Date(data.conversation.updated_at),
      };
      
      // Navigate to the new conversation
      router.push(`/chat/${newConversation.id}`);
    } catch (error) {
      console.error('Error creating new chat:', error);
    }
  }, [router]);

  const handleSelectConversation = useCallback((id: string) => {
    router.push(`/chat/${id}`);
  }, [router]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/conversations/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete conversation');
      }

      // Navigate to home or another conversation
      if (currentConversationId === id) {
        const updatedConversations = conversations.filter(conv => conv.id !== id);
        if (updatedConversations.length > 0) {
          router.push(`/chat/${updatedConversations[0].id}`);
        } else {
          router.push('/');
        }
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  }, [conversations, currentConversationId, router]);

  const handleRenameConversation = useCallback(async (id: string, newTitle: string) => {
    try {
      const response = await fetch(`/api/conversations/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newTitle
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to rename conversation');
      }

      const updatedConversations = conversations.map(conv =>
        conv.id === id ? { ...conv, title: newTitle, updatedAt: new Date() } : conv
      );
      setConversations(updatedConversations);
      
      router.refresh();
    } catch (error) {
      console.error('Error renaming conversation:', error);
    }
  }, [conversations, router]);

  const handleSettingsChange = useCallback((newSettings: ChatSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  }, [saveSettings]);

  const handleSendMessage = useCallback(async (content: string, images?: string[]) => {
    if (!content.trim() && (!images || images.length === 0)) return;

    let conversation = getCurrentConversation();
    let conversationId = currentConversationId;
    
    // Create new conversation if none exists
    if (!conversation) {
      try {
        const response = await fetch('/api/conversations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: generateTitle(content)
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to create conversation');
        }

        const data = await response.json();
        conversationId = data.conversation.id;
        
        const newConversation: Conversation = {
          id: conversationId,
          title: data.conversation.title,
          messages: [],
          createdAt: new Date(data.conversation.created_at),
          updatedAt: new Date(data.conversation.updated_at),
        };
        
        // Navigate to the new conversation instead of updating state
        router.push(`/chat/${conversationId}`);
        return;
      } catch (error) {
        console.error('Error creating conversation:', error);
        return;
      }
    }

    // Add user message optimistically
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
      images,
    };

    const updatedConversation = {
      ...conversation,
      messages: [...conversation.messages, userMessage],
      updatedAt: new Date(),
    };

    const updatedConversations = conversations.map(conv =>
      conv.id === conversationId ? updatedConversation : conv
    );
    
    setConversations(updatedConversations);
    setIsLoading(true);

    try {
      // Call API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: content,
          settings,
          images,
          conversationId,
          previousResponseId: lastResponseId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Replace temp user message with real one and add assistant message
      const realUserMessage: Message = {
        id: data.userMessage.id,
        role: 'user',
        content,
        timestamp: new Date(data.userMessage.created_at),
        images,
      };

      const assistantMessage: Message = {
        id: data.aiMessage.id,
        role: 'assistant',
        content: data.content,
        timestamp: new Date(data.aiMessage.created_at),
      };

      const finalConversation = {
        ...updatedConversation,
        messages: [...updatedConversation.messages.slice(0, -1), realUserMessage, assistantMessage],
        updatedAt: new Date(),
      };

      const finalConversations = conversations.map(conv =>
        conv.id === conversationId ? finalConversation : conv
      );
      
      setConversations(finalConversations);
      setLastResponseId(data.responseId);
      
      // Refresh the page to show updated data
      router.refresh();

    } catch (error) {
      console.error('Error sending message:', error);
      
      // Add error message
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
        timestamp: new Date(),
      };

      const errorConversation = {
        ...updatedConversation,
        messages: [...updatedConversation.messages, errorMessage],
        updatedAt: new Date(),
      };

      const errorConversations = conversations.map(conv =>
        conv.id === conversationId ? errorConversation : conv
      );
      
      setConversations(errorConversations);
    } finally {
      setIsLoading(false);
    }
  }, [
    getCurrentConversation,
    currentConversationId,
    conversations,
    generateTitle,
    settings,
    lastResponseId,
    router,
  ]);

  const handleFeedback = useCallback(async (messageId: string, feedback: 'up' | 'down') => {
    try {
      const response = await fetch(`/api/messages/${messageId}/feedback`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          feedback: feedback
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update feedback');
      }

      const updatedConversations = conversations.map(conv => ({
        ...conv,
        messages: conv.messages.map(msg =>
          msg.id === messageId 
            ? { ...msg, feedback: msg.feedback === feedback ? undefined : feedback }
            : msg
        ),
      }));
      
      setConversations(updatedConversations);
      router.refresh();
    } catch (error) {
      console.error('Error updating feedback:', error);
    }
  }, [conversations, router]);

  const handleCopy = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      // Could add a toast notification here
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, []);

  const handleRegenerate = useCallback(async (messageId: string) => {
    const conversation = getCurrentConversation();
    if (!conversation) return;

    const messageIndex = conversation.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1 || messageIndex === 0) return;

    const userMessage = conversation.messages[messageIndex - 1];
    if (userMessage.role !== 'user') return;

    // Remove the assistant message and regenerate
    const updatedMessages = conversation.messages.slice(0, messageIndex);
    const updatedConversation = {
      ...conversation,
      messages: updatedMessages,
      updatedAt: new Date(),
    };

    const updatedConversations = conversations.map(conv =>
      conv.id === updatedConversation.id ? updatedConversation : conv
    );
    
    setConversations(updatedConversations);

    // Resend the user message
    await handleSendMessage(userMessage.content, userMessage.images);
  }, [getCurrentConversation, conversations, handleSendMessage]);

  const currentConversation = getCurrentConversation();
  const currentMessages = currentConversation?.messages || [];

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        settings={settings}
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onOpenSettings={() => {}} // TODO: Implement settings modal
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <Header
          settings={settings}
          onSettingsChange={handleSettingsChange}
          currentTitle={currentConversation?.title}
        />

        {/* Chat Window */}
        <ChatWindow
          messages={currentMessages}
          isLoading={isLoading}
          onFeedback={handleFeedback}
          onCopy={handleCopy}
          onRegenerate={handleRegenerate}
        />

        {/* Chat Input */}
        <ChatInput
          onSendMessage={handleSendMessage}
          disabled={isLoading}
          placeholder="Type your message..."
          hasActiveConversation={Boolean(currentConversation)}
          onEnsureConversation={handleNewChat}
        />
      </div>
    </div>
  );
}
