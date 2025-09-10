-- ============================================
-- ChatCDC Complete Supabase Migration Script
-- ============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. Update Auth Schema for User Profiles
-- ============================================

-- Create or update profiles table for additional user data
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (id)
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
FOR INSERT WITH CHECK (auth.uid() = id);

-- Function to handle user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 2. Create Chat-Related Tables
-- ============================================

-- Drop existing tables if they exist (be careful in production!)
-- DROP TABLE IF EXISTS public.messages CASCADE;
-- DROP TABLE IF EXISTS public.conversations CASCADE;
-- DROP TABLE IF EXISTS public.uploaded_files CASCADE;

-- Create conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL DEFAULT 'New Chat',
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create uploaded_files table
CREATE TABLE IF NOT EXISTS public.uploaded_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_type TEXT NOT NULL,
    upload_status TEXT DEFAULT 'completed' CHECK (upload_status IN ('uploading', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 3. Create Indexes for Performance
-- ============================================

-- Indexes for conversations
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON public.conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON public.conversations(user_id, updated_at DESC);

-- Indexes for messages
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages(conversation_id, created_at);

-- Indexes for uploaded_files
CREATE INDEX IF NOT EXISTS idx_uploaded_files_conversation_id ON public.uploaded_files(conversation_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_user_id ON public.uploaded_files(user_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_created_at ON public.uploaded_files(created_at DESC);

-- Indexes for profiles
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON public.profiles(updated_at DESC);

-- ============================================
-- 4. Create Functions and Triggers
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_conversations_updated_at ON public.conversations;
CREATE TRIGGER update_conversations_updated_at 
    BEFORE UPDATE ON public.conversations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at 
    BEFORE UPDATE ON public.profiles 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically update conversation timestamp when messages are added
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.conversations 
    SET updated_at = NOW() 
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_conversation_on_message ON public.messages;
CREATE TRIGGER update_conversation_on_message
    AFTER INSERT ON public.messages
    FOR EACH ROW 
    EXECUTE FUNCTION update_conversation_timestamp();

-- ============================================
-- 5. Enable Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. Create RLS Policies
-- ============================================

-- Policies for conversations
CREATE POLICY "Users can view own conversations" ON public.conversations
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own conversations" ON public.conversations
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations" ON public.conversations
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations" ON public.conversations
FOR DELETE USING (auth.uid() = user_id);

-- Policies for messages
CREATE POLICY "Users can view messages in own conversations" ON public.messages
FOR SELECT USING (
    auth.uid() = user_id OR 
    EXISTS (
        SELECT 1 FROM public.conversations 
        WHERE conversations.id = messages.conversation_id 
        AND conversations.user_id = auth.uid()
    )
);

CREATE POLICY "Users can create messages in own conversations" ON public.messages
FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
        SELECT 1 FROM public.conversations 
        WHERE conversations.id = conversation_id 
        AND conversations.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update own messages" ON public.messages
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own messages" ON public.messages
FOR DELETE USING (auth.uid() = user_id);

-- Policies for uploaded_files
CREATE POLICY "Users can view files in own conversations" ON public.uploaded_files
FOR SELECT USING (
    auth.uid() = user_id OR 
    EXISTS (
        SELECT 1 FROM public.conversations 
        WHERE conversations.id = uploaded_files.conversation_id 
        AND conversations.user_id = auth.uid()
    )
);

CREATE POLICY "Users can upload files to own conversations" ON public.uploaded_files
FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
        SELECT 1 FROM public.conversations 
        WHERE conversations.id = conversation_id 
        AND conversations.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update own uploaded files" ON public.uploaded_files
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own uploaded files" ON public.uploaded_files
FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 7. Create Storage Bucket and Policies
-- ============================================

-- Create storage bucket for file uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES (
    'chat-files', 
    'chat-files', 
    false, 
    10485760, -- 10MB limit
    ARRAY['application/pdf', 'text/plain', 'image/jpeg', 'image/png', 'image/gif', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload files to own folder" ON storage.objects
FOR INSERT WITH CHECK (
    bucket_id = 'chat-files' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view own files" ON storage.objects
FOR SELECT USING (
    bucket_id = 'chat-files' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own files" ON storage.objects
FOR UPDATE USING (
    bucket_id = 'chat-files' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own files" ON storage.objects
FOR DELETE USING (
    bucket_id = 'chat-files' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================
-- 8. Grant Permissions
-- ============================================

-- Grant necessary permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.conversations TO authenticated;
GRANT ALL ON public.messages TO authenticated;
GRANT ALL ON public.uploaded_files TO authenticated;

-- Grant permissions for sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant storage permissions
GRANT ALL ON storage.objects TO authenticated;
GRANT ALL ON storage.buckets TO authenticated;

-- ============================================
-- 9. Create Helpful Views (Optional)
-- ============================================

-- View for conversation summaries
CREATE OR REPLACE VIEW conversation_summaries AS
SELECT 
    c.id,
    c.title,
    c.user_id,
    c.created_at,
    c.updated_at,
    COUNT(m.id) as message_count,
    MAX(m.created_at) as last_message_at
FROM public.conversations c
LEFT JOIN public.messages m ON c.id = m.conversation_id
GROUP BY c.id, c.title, c.user_id, c.created_at, c.updated_at;

-- Grant permissions on view
GRANT SELECT ON conversation_summaries TO authenticated;

-- ============================================
-- 10. Create Useful Functions
-- ============================================

-- Function to get user's conversation count
CREATE OR REPLACE FUNCTION get_user_conversation_count(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER 
        FROM public.conversations 
        WHERE user_id = user_uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get conversation with messages
CREATE OR REPLACE FUNCTION get_conversation_with_messages(conversation_uuid UUID)
RETURNS TABLE (
    conversation_id UUID,
    conversation_title TEXT,
    conversation_created_at TIMESTAMPTZ,
    conversation_updated_at TIMESTAMPTZ,
    message_id UUID,
    message_role TEXT,
    message_content TEXT,
    message_created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id as conversation_id,
        c.title as conversation_title,
        c.created_at as conversation_created_at,
        c.updated_at as conversation_updated_at,
        m.id as message_id,
        m.role as message_role,
        m.content as message_content,
        m.created_at as message_created_at
    FROM public.conversations c
    LEFT JOIN public.messages m ON c.id = m.conversation_id
    WHERE c.id = conversation_uuid
    AND c.user_id = auth.uid()
    ORDER BY m.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_user_conversation_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_conversation_with_messages(UUID) TO authenticated;

-- ============================================
-- 11. Sample Data (Optional - Remove in Production)
-- ============================================

-- This section can be used for testing but should be removed in production

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

-- Verify the migration
DO $$
BEGIN
    RAISE NOTICE 'ChatCDC Supabase migration completed successfully!';
    RAISE NOTICE 'Tables created: profiles, conversations, messages, uploaded_files';
    RAISE NOTICE 'Storage bucket created: chat-files';
    RAISE NOTICE 'RLS policies and permissions configured';
    RAISE NOTICE 'Indexes and triggers created for performance';
END $$;
