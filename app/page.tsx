'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Message, Conversation, ChatSettings } from '@/types/chat';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ChatWindow from '@/components/ChatWindow';
import ChatInput from '@/components/ChatInput';

const defaultSettings: ChatSettings = {
  model: 'gpt-5',
  verbosity: 'medium',
  reasoningEffort: 'minimal',
  enableWebSearch: false,
};

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ChatSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResponseId, setLastResponseId] = useState<string | null>(null);

  // Load conversations from localStorage on mount
  useEffect(() => {
    const savedConversations = localStorage.getItem('chatcdc-conversations');
    const savedSettings = localStorage.getItem('chatcdc-settings');
    
    if (savedConversations) {
      try {
        const parsed = JSON.parse(savedConversations);
        const conversations = parsed.map((conv: any) => ({
          ...conv,
          createdAt: new Date(conv.createdAt),
          updatedAt: new Date(conv.updatedAt),
          messages: conv.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          })),
        }));
        setConversations(conversations);
        
        if (conversations.length > 0) {
          setCurrentConversationId(conversations[0].id);
        }
      } catch (error) {
        console.error('Error loading conversations:', error);
      }
    }
    
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    }
  }, []);

  // Save conversations to localStorage
  const saveConversations = useCallback((conversations: Conversation[]) => {
    localStorage.setItem('chatcdc-conversations', JSON.stringify(conversations));
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

  const handleNewChat = useCallback(() => {
    const newConversation: Conversation = {
      id: uuidv4(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const updatedConversations = [newConversation, ...conversations];
    setConversations(updatedConversations);
    setCurrentConversationId(newConversation.id);
    setLastResponseId(null);
    saveConversations(updatedConversations);
  }, [conversations, saveConversations]);

  const handleSelectConversation = useCallback((id: string) => {
    setCurrentConversationId(id);
    setLastResponseId(null);
  }, []);

  const handleDeleteConversation = useCallback((id: string) => {
    const updatedConversations = conversations.filter(conv => conv.id !== id);
    setConversations(updatedConversations);
    
    if (currentConversationId === id) {
      setCurrentConversationId(updatedConversations.length > 0 ? updatedConversations[0].id : null);
    }
    
    saveConversations(updatedConversations);
  }, [conversations, currentConversationId, saveConversations]);

  const handleRenameConversation = useCallback((id: string, newTitle: string) => {
    const updatedConversations = conversations.map(conv =>
      conv.id === id ? { ...conv, title: newTitle, updatedAt: new Date() } : conv
    );
    setConversations(updatedConversations);
    saveConversations(updatedConversations);
  }, [conversations, saveConversations]);

  const handleSettingsChange = useCallback((newSettings: ChatSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  }, [saveSettings]);

  const handleSendMessage = useCallback(async (content: string, images?: string[]) => {
    if (!content.trim() && (!images || images.length === 0)) return;

    let conversation = getCurrentConversation();
    
    // Create new conversation if none exists
    if (!conversation) {
      conversation = {
        id: uuidv4(),
        title: generateTitle(content),
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updatedConversations = [conversation, ...conversations];
      setConversations(updatedConversations);
      setCurrentConversationId(conversation.id);
      saveConversations(updatedConversations);
    }

    // Add user message
    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: new Date(),
      images,
    };

    // Update conversation title if it's the first message
    const shouldUpdateTitle = conversation.messages.length === 0;
    const updatedTitle = shouldUpdateTitle ? generateTitle(content) : conversation.title;

    const updatedConversation = {
      ...conversation,
      title: updatedTitle,
      messages: [...conversation.messages, userMessage],
      updatedAt: new Date(),
    };

    const updatedConversations = conversations.map(conv =>
      conv.id === updatedConversation.id ? updatedConversation : conv
    );
    
    setConversations(updatedConversations);
    saveConversations(updatedConversations);
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

      // Add assistant message
      const assistantMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: data.content,
        timestamp: new Date(),
      };

      const finalConversation = {
        ...updatedConversation,
        messages: [...updatedConversation.messages, assistantMessage],
        updatedAt: new Date(),
      };

      const finalConversations = conversations.map(conv =>
        conv.id === finalConversation.id ? finalConversation : conv
      );
      
      setConversations(finalConversations);
      saveConversations(finalConversations);
      setLastResponseId(data.responseId);

    } catch (error) {
      console.error('Error sending message:', error);
      
      // Add error message
      const errorMessage: Message = {
        id: uuidv4(),
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
        conv.id === errorConversation.id ? errorConversation : conv
      );
      
      setConversations(errorConversations);
      saveConversations(errorConversations);
    } finally {
      setIsLoading(false);
    }
  }, [
    getCurrentConversation,
    conversations,
    generateTitle,
    saveConversations,
    settings,
    lastResponseId,
  ]);

  const handleFeedback = useCallback((messageId: string, feedback: 'up' | 'down') => {
    const updatedConversations = conversations.map(conv => ({
      ...conv,
      messages: conv.messages.map(msg =>
        msg.id === messageId 
          ? { ...msg, feedback: msg.feedback === feedback ? null : feedback }
          : msg
      ),
    }));
    
    setConversations(updatedConversations);
    saveConversations(updatedConversations);
  }, [conversations, saveConversations]);

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
    saveConversations(updatedConversations);

    // Resend the user message
    await handleSendMessage(userMessage.content, userMessage.images);
  }, [getCurrentConversation, conversations, saveConversations, handleSendMessage]);

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
        />
      </div>
    </div>
  );
}
