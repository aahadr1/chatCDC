-- ============================================
-- ChatCDC Clean Supabase Migration Script
-- This script safely handles existing policies and tables
-- ============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. Drop existing policies to avoid conflicts
-- ============================================

-- Drop existing RLS policies for conversations
DROP POLICY IF EXISTS "Users can view own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can create own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can delete own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Allow anonymous access to conversations" ON public.conversations;

-- Drop existing RLS policies for messages
DROP POLICY IF EXISTS "Users can view messages in own conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can create messages in own conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can update own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete own messages" ON public.messages;
DROP POLICY IF EXISTS "Allow anonymous access to messages" ON public.messages;

-- Drop existing RLS policies for uploaded_files
DROP POLICY IF EXISTS "Users can view files in own conversations" ON public.uploaded_files;
DROP POLICY IF EXISTS "Users can upload files to own conversations" ON public.uploaded_files;
DROP POLICY IF EXISTS "Users can update own uploaded files" ON public.uploaded_files;
DROP POLICY IF EXISTS "Users can delete own uploaded files" ON public.uploaded_files;
DROP POLICY IF EXISTS "Allow anonymous access to uploaded_files" ON public.uploaded_files;

-- Drop existing RLS policies for profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Drop existing storage policies
DROP POLICY IF EXISTS "Users can upload files to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public downloads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes" ON storage.objects;

-- ============================================
-- 2. Update existing tables or create new ones
-- ============================================

-- Create or update profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (id)
);

-- Update conversations table structure
-- First check if we need to modify the user_id column type
DO $$
BEGIN
    -- Add UUID user_id column if it doesn't exist or is wrong type
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversations' 
        AND column_name = 'user_id' 
        AND data_type = 'uuid'
    ) THEN
        -- Drop the old column if it exists with wrong type
        ALTER TABLE public.conversations DROP COLUMN IF EXISTS user_id;
        -- Add the new UUID column
        ALTER TABLE public.conversations ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Update messages table structure
DO $$
BEGIN
    -- Add UUID user_id column if it doesn't exist or is wrong type
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' 
        AND column_name = 'user_id' 
        AND data_type = 'uuid'
    ) THEN
        -- Drop the old column if it exists with wrong type
        ALTER TABLE public.messages DROP COLUMN IF EXISTS user_id;
        -- Add the new UUID column
        ALTER TABLE public.messages ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;

    -- Add metadata column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' 
        AND column_name = 'metadata'
    ) THEN
        ALTER TABLE public.messages ADD COLUMN metadata JSONB DEFAULT '{}';
    END IF;
END $$;

-- Update uploaded_files table structure
DO $$
BEGIN
    -- Add UUID user_id column if it doesn't exist or is wrong type
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'uploaded_files' 
        AND column_name = 'user_id' 
        AND data_type = 'uuid'
    ) THEN
        -- Drop the old column if it exists with wrong type
        ALTER TABLE public.uploaded_files DROP COLUMN IF EXISTS user_id;
        -- Add the new UUID column
        ALTER TABLE public.uploaded_files ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;

    -- Add upload_status column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'uploaded_files' 
        AND column_name = 'upload_status'
    ) THEN
        ALTER TABLE public.uploaded_files ADD COLUMN upload_status TEXT DEFAULT 'completed' CHECK (upload_status IN ('uploading', 'completed', 'failed'));
    END IF;
END $$;

-- ============================================
-- 3. Drop and recreate indexes
-- ============================================

-- Drop existing indexes
DROP INDEX IF EXISTS idx_conversations_user_id;
DROP INDEX IF EXISTS idx_conversations_updated_at;
DROP INDEX IF EXISTS idx_conversations_user_updated;
DROP INDEX IF EXISTS idx_messages_conversation_id;
DROP INDEX IF EXISTS idx_messages_user_id;
DROP INDEX IF EXISTS idx_messages_created_at;
DROP INDEX IF EXISTS idx_messages_conversation_created;
DROP INDEX IF EXISTS idx_uploaded_files_conversation_id;
DROP INDEX IF EXISTS idx_uploaded_files_user_id;
DROP INDEX IF EXISTS idx_uploaded_files_created_at;
DROP INDEX IF EXISTS idx_profiles_updated_at;

-- Create new indexes
CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX idx_conversations_updated_at ON public.conversations(updated_at DESC);
CREATE INDEX idx_conversations_user_updated ON public.conversations(user_id, updated_at DESC);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_user_id ON public.messages(user_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);
CREATE INDEX idx_messages_conversation_created ON public.messages(conversation_id, created_at);
CREATE INDEX idx_uploaded_files_conversation_id ON public.uploaded_files(conversation_id);
CREATE INDEX idx_uploaded_files_user_id ON public.uploaded_files(user_id);
CREATE INDEX idx_uploaded_files_created_at ON public.uploaded_files(created_at DESC);
CREATE INDEX idx_profiles_updated_at ON public.profiles(updated_at DESC);

-- ============================================
-- 4. Drop and recreate functions and triggers
-- ============================================

-- Drop existing triggers
DROP TRIGGER IF EXISTS update_conversations_updated_at ON public.conversations;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_conversation_on_message ON public.messages;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop existing functions
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP FUNCTION IF EXISTS update_conversation_timestamp();
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS get_user_conversation_count(UUID);
DROP FUNCTION IF EXISTS get_conversation_with_messages(UUID);

-- Recreate functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.conversations 
    SET updated_at = NOW() 
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

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

-- Recreate triggers
CREATE TRIGGER update_conversations_updated_at 
    BEFORE UPDATE ON public.conversations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at 
    BEFORE UPDATE ON public.profiles 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversation_on_message
    AFTER INSERT ON public.messages
    FOR EACH ROW 
    EXECUTE FUNCTION update_conversation_timestamp();

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 5. Enable Row Level Security
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. Create fresh RLS policies
-- ============================================

-- Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
FOR INSERT WITH CHECK (auth.uid() = id);

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
-- 7. Create or update storage bucket
-- ============================================

-- Insert or update storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES (
    'chat-files', 
    'chat-files', 
    false, 
    10485760, -- 10MB limit
    ARRAY['application/pdf', 'text/plain', 'image/jpeg', 'image/png', 'image/gif', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

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
-- 8. Grant permissions
-- ============================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.conversations TO authenticated;
GRANT ALL ON public.messages TO authenticated;
GRANT ALL ON public.uploaded_files TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================
-- 9. Create helper functions
-- ============================================

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

GRANT EXECUTE ON FUNCTION get_user_conversation_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_conversation_with_messages(UUID) TO authenticated;

-- ============================================
-- 10. Create helpful view
-- ============================================

DROP VIEW IF EXISTS conversation_summaries;
CREATE VIEW conversation_summaries AS
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

GRANT SELECT ON conversation_summaries TO authenticated;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'ChatCDC Clean Migration completed successfully!';
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'All existing policies and triggers were safely dropped and recreated';
    RAISE NOTICE 'Tables updated: profiles, conversations, messages, uploaded_files';
    RAISE NOTICE 'Storage bucket created/updated: chat-files';
    RAISE NOTICE 'RLS policies and permissions configured';
    RAISE NOTICE 'Indexes and triggers created for performance';
    RAISE NOTICE 'Your database is ready for the ChatCDC authentication system!';
    RAISE NOTICE '==============================================';
END $$;
