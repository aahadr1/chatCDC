'use client';

import React from 'react';
import { Conversation, ChatSettings } from '@/types/chat';
import { 
  MessageSquare, 
  Plus, 
  Settings, 
  User, 
  Crown,
  Trash2,
  Edit3
} from 'lucide-react';

interface SidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  settings: ChatSettings;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onOpenSettings: () => void;
}

export default function Sidebar({
  conversations,
  currentConversationId,
  settings,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onOpenSettings,
}: SidebarProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState('');

  const handleStartEdit = (conversation: Conversation) => {
    setEditingId(conversation.id);
    setEditingTitle(conversation.title);
  };

  const handleSaveEdit = () => {
    if (editingId && editingTitle.trim()) {
      onRenameConversation(editingId, editingTitle.trim());
    }
    setEditingId(null);
    setEditingTitle('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingTitle('');
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="w-80 bg-apple-gray-50 border-r border-apple-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-apple-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-apple-gray-900">ChatCDC</h1>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-apple-green-500 rounded-full animate-pulse-subtle"></div>
            <span className="text-xs text-apple-gray-500 font-medium">
              {settings.model.toUpperCase()}
            </span>
          </div>
        </div>
        
        <button
          onClick={onNewChat}
          className="w-full btn-primary flex items-center justify-center gap-2 py-3"
        >
          <Plus size={18} />
          New Chat
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        <div className="space-y-2">
          {conversations.length === 0 ? (
            <div className="text-center py-8 text-apple-gray-500">
              <MessageSquare size={48} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs mt-1">Start a new chat to begin</p>
            </div>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`group relative rounded-xl transition-all duration-200 ${
                  currentConversationId === conversation.id
                    ? 'bg-apple-blue-500 text-white shadow-lg'
                    : 'hover:bg-white hover:shadow-sm'
                }`}
              >
                {editingId === conversation.id ? (
                  <div className="p-3">
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      onBlur={handleSaveEdit}
                      className="w-full bg-transparent border-b border-current outline-none text-sm"
                      autoFocus
                    />
                  </div>
                ) : (
                  <div
                    onClick={() => onSelectConversation(conversation.id)}
                    className="p-3 cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate mb-1">
                          {conversation.title}
                        </h3>
                        <p className="text-xs opacity-70">
                          {formatDate(conversation.updatedAt)} • {conversation.messages.length} messages
                        </p>
                      </div>
                      
                      {/* Action Buttons */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ml-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(conversation);
                          }}
                          className="p-1 rounded hover:bg-black/10 transition-colors duration-200"
                          title="Rename"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteConversation(conversation.id);
                          }}
                          className="p-1 rounded hover:bg-black/10 transition-colors duration-200 text-apple-red-500"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-apple-gray-200 space-y-2">
        <button
          onClick={onOpenSettings}
          className="sidebar-item w-full justify-start"
        >
          <Settings size={18} />
          <span>Settings</span>
        </button>
        
        <div className="sidebar-item w-full justify-start">
          <User size={18} />
          <span>Profile</span>
        </div>
        
        <div className="sidebar-item w-full justify-start">
          <Crown size={18} />
          <span>Upgrade to Pro</span>
        </div>
      </div>
    </div>
  );
}
