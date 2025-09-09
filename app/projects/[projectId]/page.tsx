'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Send, FileText, Loader2, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabaseClient';

interface ProjectData {
  id: string;
  name: string;
  status: string;
  document_count: number;
  created_at: string;
}

interface ConversationMessage {
  id: string;
  user_message: string;
  ai_response: string;
  created_at: string;
}

export default function ProjectChatPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<ProjectData | null>(null);
  const [conversations, setConversations] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversations]);

  const loadProject = useCallback(async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      if (!supabase) {
        setError('Supabase not configured');
        setLoading(false);
        return;
      }

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        router.push('/login');
        return;
      }

      // Load project details
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('id, name, status, document_count, created_at')
        .eq('id', projectId)
        .eq('user_id', user.id)
        .single();

      if (projectError || !projectData) {
        setError('Project not found or access denied');
        setLoading(false);
        return;
      }

      setProject(projectData);

      // Load conversation history
      const { data: conversationData, error: conversationError } = await supabase
        .from('project_conversations')
        .select('id, user_message, ai_response, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (conversationError) {
        console.error('Error loading conversations:', conversationError);
      } else {
        setConversations(conversationData || []);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading project:', err);
      setError('Failed to load project');
      setLoading(false);
    }
  }, [projectId, router]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const handleSendMessage = async () => {
    if (!message.trim() || sending || !project) return;

    setSending(true);
    const userMessage = message.trim();
    setMessage('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const response = await fetch(`/api/projects/${projectId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send message');
      }

      const data = await response.json();

      // Add new conversation to the list
      const newConversation: ConversationMessage = {
        id: Date.now().toString(),
        user_message: userMessage,
        ai_response: data.response,
        created_at: new Date().toISOString(),
      };

      setConversations(prev => [...prev, newConversation]);
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-apple-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={48} className="animate-spin mx-auto mb-4 text-apple-blue-500" />
          <p className="text-apple-gray-600">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-apple-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-white rounded-xl shadow-sm border border-apple-gray-200 p-8 max-w-md">
            <p className="text-apple-red-600 mb-4">{error || 'Project not found'}</p>
            <Link 
              href="/"
              className="btn-primary inline-flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-apple-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-apple-gray-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link 
            href="/"
            className="p-2 hover:bg-apple-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-apple-gray-900">{project.name}</h1>
            <div className="flex items-center gap-4 text-sm text-apple-gray-600 mt-1">
              <span className="flex items-center gap-1">
                <FileText size={14} />
                {project.document_count} documents
              </span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                project.status === 'ready' 
                  ? 'bg-apple-green-100 text-apple-green-700'
                  : 'bg-apple-orange-100 text-apple-orange-700'
              }`}>
                {project.status === 'ready' ? 'Ready' : 'Processing'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6">
          {conversations.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare size={48} className="mx-auto mb-4 text-apple-gray-400" />
              <h3 className="text-lg font-medium text-apple-gray-700 mb-2">
                Start chatting with your documents
              </h3>
              <p className="text-apple-gray-500">
                Ask questions about the content in your uploaded PDFs
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {conversations.map((conv) => (
                <div key={conv.id} className="space-y-4">
                  {/* User Message */}
                  <div className="flex justify-end">
                    <div className="bg-apple-blue-500 text-white rounded-2xl rounded-tr-md px-4 py-3 max-w-2xl">
                      <p className="whitespace-pre-wrap">{conv.user_message}</p>
                    </div>
                  </div>

                  {/* AI Response */}
                  <div className="flex justify-start">
                    <div className="bg-white border border-apple-gray-200 rounded-2xl rounded-tl-md px-4 py-3 max-w-2xl shadow-sm">
                      <p className="whitespace-pre-wrap text-apple-gray-800">{conv.ai_response}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-6 bg-white border-t border-apple-gray-200">
          {project.status !== 'ready' && (
            <div className="mb-4 p-3 bg-apple-orange-50 border border-apple-orange-200 rounded-lg">
              <p className="text-sm text-apple-orange-700">
                Documents are still being processed. Please wait before sending messages.
              </p>
            </div>
          )}

          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder={project.status === 'ready' ? "Ask a question about your documents..." : "Processing documents..."}
                disabled={sending || project.status !== 'ready'}
                className="w-full px-4 py-3 border border-apple-gray-200 rounded-2xl focus:ring-2 focus:ring-apple-blue-500 focus:border-transparent outline-none resize-none transition-colors"
                rows={1}
                style={{ minHeight: '48px', maxHeight: '120px' }}
              />
            </div>
            <button
              onClick={handleSendMessage}
              disabled={!message.trim() || sending || project.status !== 'ready'}
              className="p-3 bg-apple-blue-500 text-white rounded-2xl hover:bg-apple-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              {sending ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Send size={20} />
              )}
            </button>
          </div>

          <p className="text-xs text-apple-gray-500 mt-2 text-center">
            AI responses are based on your uploaded documents
          </p>
        </div>
      </div>
    </div>
  );
}
