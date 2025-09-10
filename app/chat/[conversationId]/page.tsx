import React from 'react';
import { redirect, notFound } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import ChatInterface from '@/components/ChatInterface';

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

async function getConversations(): Promise<ConversationWithMessages[]> {
  const supabase = createServerComponentClient({ cookies });
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select(`
      id,
      title,
      created_at,
      updated_at,
      messages (
        id,
        role,
        content,
        images,
        feedback,
        created_at
      )
    `)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching conversations:', error);
    return [];
  }

  // Sort messages within each conversation
  return (conversations || []).map(conv => ({
    ...conv,
    messages: (conv.messages || []).sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }));
}

async function getSpecificConversation(conversationId: string): Promise<ConversationWithMessages | null> {
  const supabase = createServerComponentClient({ cookies });
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/login');
  }

  const { data: conversation, error } = await supabase
    .from('conversations')
    .select(`
      id,
      title,
      created_at,
      updated_at,
      messages (
        id,
        role,
        content,
        images,
        feedback,
        created_at
      )
    `)
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single();

  if (error || !conversation) {
    return null;
  }

  // Sort messages by creation time
  return {
    ...conversation,
    messages: (conversation.messages || []).sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  };
}

interface ConversationPageProps {
  params: {
    conversationId: string;
  };
}

export default async function ConversationPage({ params }: ConversationPageProps) {
  const { conversationId } = params;
  
  const [conversations, specificConversation] = await Promise.all([
    getConversations(),
    getSpecificConversation(conversationId)
  ]);

  if (!specificConversation) {
    notFound();
  }

  return (
    <ChatInterface 
      initialConversations={conversations} 
      initialConversationId={conversationId}
    />
  );
}
