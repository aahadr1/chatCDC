-- ============================================
-- ChatCDC Step-by-Step Migration Script
-- Run this script in your Supabase SQL Editor
-- ============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- STEP 1: Create all tables first
-- ============================================

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (id)
);

-- Update conversations table (keep existing data if any)
-- Check if conversations table exists and update it
DO $$
BEGIN
    -- Create table if it doesn't exist
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'conversations') THEN
        CREATE TABLE public.conversations (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            title TEXT NOT NULL DEFAULT 'New Chat',
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    ELSE
        -- Table exists, check if we need to update user_id column
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'conversations' 
            AND column_name = 'user_id' 
            AND data_type = 'text'
        ) THEN
            -- Convert TEXT user_id to UUID (this will require data migration)
            RAISE NOTICE 'Converting conversations.user_id from TEXT to UUID...';
            
            -- Add temporary UUID column
            ALTER TABLE public.conversations ADD COLUMN user_id_uuid UUID;
            
            -- Try to convert existing data (this might fail if data is not UUID format)
            UPDATE public.conversations SET user_id_uuid = user_id::UUID WHERE user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
            
            -- Drop old column and rename new one
            ALTER TABLE public.conversations DROP COLUMN user_id;
            ALTER TABLE public.conversations RENAME COLUMN user_id_uuid TO user_id;
            
            -- Add NOT NULL constraint and foreign key
            ALTER TABLE public.conversations ALTER COLUMN user_id SET NOT NULL;
            ALTER TABLE public.conversations ADD CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
        ELSIF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'conversations' 
            AND column_name = 'user_id'
        ) THEN
            -- Add user_id column if it doesn't exist
            ALTER TABLE public.conversations ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- Update messages table
DO $$
BEGIN
    -- Create table if it doesn't exist
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'messages') THEN
        CREATE TABLE public.messages (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
            content TEXT NOT NULL,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    ELSE
        -- Table exists, check if we need to update user_id column
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'messages' 
            AND column_name = 'user_id' 
            AND data_type = 'text'
        ) THEN
            -- Convert TEXT user_id to UUID
            RAISE NOTICE 'Converting messages.user_id from TEXT to UUID...';
            
            -- Add temporary UUID column
            ALTER TABLE public.messages ADD COLUMN user_id_uuid UUID;
            
            -- Try to convert existing data
            UPDATE public.messages SET user_id_uuid = user_id::UUID WHERE user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
            
            -- Drop old column and rename new one
            ALTER TABLE public.messages DROP COLUMN user_id;
            ALTER TABLE public.messages RENAME COLUMN user_id_uuid TO user_id;
            
            -- Add NOT NULL constraint and foreign key
            ALTER TABLE public.messages ALTER COLUMN user_id SET NOT NULL;
            ALTER TABLE public.messages ADD CONSTRAINT messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
        ELSIF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'messages' 
            AND column_name = 'user_id'
        ) THEN
            -- Add user_id column if it doesn't exist
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
    END IF;
END $$;

-- Update uploaded_files table
DO $$
BEGIN
    -- Create table if it doesn't exist
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'uploaded_files') THEN
        CREATE TABLE public.uploaded_files (
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
    ELSE
        -- Table exists, check if we need to update user_id column
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'uploaded_files' 
            AND column_name = 'user_id' 
            AND data_type = 'text'
        ) THEN
            -- Convert TEXT user_id to UUID
            RAISE NOTICE 'Converting uploaded_files.user_id from TEXT to UUID...';
            
            -- Add temporary UUID column
            ALTER TABLE public.uploaded_files ADD COLUMN user_id_uuid UUID;
            
            -- Try to convert existing data
            UPDATE public.uploaded_files SET user_id_uuid = user_id::UUID WHERE user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
            
            -- Drop old column and rename new one
            ALTER TABLE public.uploaded_files DROP COLUMN user_id;
            ALTER TABLE public.uploaded_files RENAME COLUMN user_id_uuid TO user_id;
            
            -- Add NOT NULL constraint and foreign key
            ALTER TABLE public.uploaded_files ALTER COLUMN user_id SET NOT NULL;
            ALTER TABLE public.uploaded_files ADD CONSTRAINT uploaded_files_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
        ELSIF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'uploaded_files' 
            AND column_name = 'user_id'
        ) THEN
            -- Add user_id column if it doesn't exist
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
    END IF;
END $$;

-- ============================================
-- STEP 2: Create indexes
-- ============================================

-- Drop existing indexes safely
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

-- Create indexes
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
-- STEP 3: Create functions and triggers
-- ============================================

-- Drop existing functions and triggers
DROP TRIGGER IF EXISTS update_conversations_updated_at ON public.conversations;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_conversation_on_message ON public.messages;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

DROP FUNCTION IF EXISTS update_updated_at_column();
DROP FUNCTION IF EXISTS update_conversation_timestamp();
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create functions
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

-- Create triggers
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
-- STEP 4: Enable RLS and drop existing policies
-- ============================================

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies safely
DO $$
DECLARE
    pol RECORD;
BEGIN
    -- Drop policies for profiles
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public' LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON public.profiles';
    END LOOP;
    
    -- Drop policies for conversations
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'conversations' AND schemaname = 'public' LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON public.conversations';
    END LOOP;
    
    -- Drop policies for messages
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'messages' AND schemaname = 'public' LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON public.messages';
    END LOOP;
    
    -- Drop policies for uploaded_files
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'uploaded_files' AND schemaname = 'public' LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON public.uploaded_files';
    END LOOP;
END $$;

-- ============================================
-- STEP 5: Create fresh RLS policies
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
-- STEP 6: Create storage bucket and policies
-- ============================================

-- Create storage bucket
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

-- Drop existing storage policies
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON storage.objects';
    END LOOP;
END $$;

-- Create storage policies
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
-- STEP 7: Grant permissions
-- ============================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.conversations TO authenticated;
GRANT ALL ON public.messages TO authenticated;
GRANT ALL ON public.uploaded_files TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================
-- STEP 8: Create helper functions
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

GRANT EXECUTE ON FUNCTION get_user_conversation_count(UUID) TO authenticated;

-- ============================================
-- MIGRATION COMPLETE!
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'ChatCDC Migration completed successfully!';
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Tables created/updated: profiles, conversations, messages, uploaded_files';
    RAISE NOTICE 'Storage bucket created: chat-files';
    RAISE NOTICE 'RLS policies and permissions configured';
    RAISE NOTICE 'Your database is ready for authentication!';
    RAISE NOTICE '==============================================';
END $$;
