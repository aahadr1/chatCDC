-- ============================================
-- COMPLETE PROJECT MANAGEMENT MIGRATION
-- Run this script in your Supabase SQL Editor
-- This includes all existing tables + new project features
-- ============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- STEP 1: Create all existing tables (if not exists)
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

-- Create conversations table (existing)
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL DEFAULT 'New Chat',
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create messages table (existing)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- STEP 2: Create new project management tables
-- ============================================

-- Create projects table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'processing', 'completed', 'archived')),
    document_count INTEGER DEFAULT 0,
    total_characters INTEGER DEFAULT 0,
    knowledge_base TEXT, -- Stores the combined text from all documents
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create project_documents table
CREATE TABLE IF NOT EXISTS public.project_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_url TEXT, -- URL to the stored file in Supabase Storage
    extracted_text TEXT, -- Text extracted from the document
    text_length INTEGER DEFAULT 0,
    processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
    processing_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create project_conversations table
CREATE TABLE IF NOT EXISTS public.project_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create project_messages table
CREATE TABLE IF NOT EXISTS public.project_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.project_conversations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create processing_jobs table for tracking file processing
CREATE TABLE IF NOT EXISTS public.processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL DEFAULT 'file_processing',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    total_files INTEGER DEFAULT 0,
    processed_files INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- STEP 3: Create indexes for better performance
-- ============================================

-- Existing table indexes
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON public.conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);

-- Projects indexes
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON public.projects(created_at DESC);

-- Project documents indexes
CREATE INDEX IF NOT EXISTS idx_project_documents_project_id ON public.project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_user_id ON public.project_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_processing_status ON public.project_documents(processing_status);

-- Project conversations indexes
CREATE INDEX IF NOT EXISTS idx_project_conversations_project_id ON public.project_conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_project_conversations_user_id ON public.project_conversations(user_id);

-- Project messages indexes
CREATE INDEX IF NOT EXISTS idx_project_messages_conversation_id ON public.project_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_project_messages_project_id ON public.project_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_project_messages_created_at ON public.project_messages(created_at);

-- Processing jobs indexes
CREATE INDEX IF NOT EXISTS idx_processing_jobs_project_id ON public.processing_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_user_id ON public.processing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON public.processing_jobs(status);

-- ============================================
-- STEP 4: Enable Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 5: Create RLS Policies
-- ============================================

-- Profiles policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Conversations policies (existing)
DROP POLICY IF EXISTS "Users can view their own conversations" ON public.conversations;
CREATE POLICY "Users can view their own conversations" ON public.conversations
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own conversations" ON public.conversations;
CREATE POLICY "Users can insert their own conversations" ON public.conversations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own conversations" ON public.conversations;
CREATE POLICY "Users can update their own conversations" ON public.conversations
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own conversations" ON public.conversations;
CREATE POLICY "Users can delete their own conversations" ON public.conversations
    FOR DELETE USING (auth.uid() = user_id);

-- Messages policies (existing)
DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;
CREATE POLICY "Users can view their own messages" ON public.messages
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own messages" ON public.messages;
CREATE POLICY "Users can insert their own messages" ON public.messages
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
CREATE POLICY "Users can update their own messages" ON public.messages
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;
CREATE POLICY "Users can delete their own messages" ON public.messages
    FOR DELETE USING (auth.uid() = user_id);

-- Projects policies
DROP POLICY IF EXISTS "Users can view their own projects" ON public.projects;
CREATE POLICY "Users can view their own projects" ON public.projects
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own projects" ON public.projects;
CREATE POLICY "Users can insert their own projects" ON public.projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own projects" ON public.projects;
CREATE POLICY "Users can update their own projects" ON public.projects
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own projects" ON public.projects;
CREATE POLICY "Users can delete their own projects" ON public.projects
    FOR DELETE USING (auth.uid() = user_id);

-- Project documents policies
DROP POLICY IF EXISTS "Users can view their own project documents" ON public.project_documents;
CREATE POLICY "Users can view their own project documents" ON public.project_documents
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own project documents" ON public.project_documents;
CREATE POLICY "Users can insert their own project documents" ON public.project_documents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own project documents" ON public.project_documents;
CREATE POLICY "Users can update their own project documents" ON public.project_documents
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own project documents" ON public.project_documents;
CREATE POLICY "Users can delete their own project documents" ON public.project_documents
    FOR DELETE USING (auth.uid() = user_id);

-- Project conversations policies
DROP POLICY IF EXISTS "Users can view their own project conversations" ON public.project_conversations;
CREATE POLICY "Users can view their own project conversations" ON public.project_conversations
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own project conversations" ON public.project_conversations;
CREATE POLICY "Users can insert their own project conversations" ON public.project_conversations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own project conversations" ON public.project_conversations;
CREATE POLICY "Users can update their own project conversations" ON public.project_conversations
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own project conversations" ON public.project_conversations;
CREATE POLICY "Users can delete their own project conversations" ON public.project_conversations
    FOR DELETE USING (auth.uid() = user_id);

-- Project messages policies
DROP POLICY IF EXISTS "Users can view their own project messages" ON public.project_messages;
CREATE POLICY "Users can view their own project messages" ON public.project_messages
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own project messages" ON public.project_messages;
CREATE POLICY "Users can insert their own project messages" ON public.project_messages
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own project messages" ON public.project_messages;
CREATE POLICY "Users can update their own project messages" ON public.project_messages
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own project messages" ON public.project_messages;
CREATE POLICY "Users can delete their own project messages" ON public.project_messages
    FOR DELETE USING (auth.uid() = user_id);

-- Processing jobs policies
DROP POLICY IF EXISTS "Users can view their own processing jobs" ON public.processing_jobs;
CREATE POLICY "Users can view their own processing jobs" ON public.processing_jobs
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own processing jobs" ON public.processing_jobs;
CREATE POLICY "Users can insert their own processing jobs" ON public.processing_jobs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own processing jobs" ON public.processing_jobs;
CREATE POLICY "Users can update their own processing jobs" ON public.processing_jobs
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own processing jobs" ON public.processing_jobs;
CREATE POLICY "Users can delete their own processing jobs" ON public.processing_jobs
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- STEP 6: Create functions for updating timestamps
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at (existing tables)
DROP TRIGGER IF EXISTS update_conversations_updated_at ON public.conversations;
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create triggers for updated_at (new tables)
DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_documents_updated_at ON public.project_documents;
CREATE TRIGGER update_project_documents_updated_at BEFORE UPDATE ON public.project_documents
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_conversations_updated_at ON public.project_conversations;
CREATE TRIGGER update_project_conversations_updated_at BEFORE UPDATE ON public.project_conversations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_processing_jobs_updated_at ON public.processing_jobs;
CREATE TRIGGER update_processing_jobs_updated_at BEFORE UPDATE ON public.processing_jobs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- STEP 7: Create function to update project statistics
-- ============================================

CREATE OR REPLACE FUNCTION public.update_project_statistics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update document count and total characters for the project
    UPDATE public.projects 
    SET 
        document_count = (
            SELECT COUNT(*) 
            FROM public.project_documents 
            WHERE project_id = COALESCE(NEW.project_id, OLD.project_id)
        ),
        total_characters = (
            SELECT COALESCE(SUM(text_length), 0)
            FROM public.project_documents 
            WHERE project_id = COALESCE(NEW.project_id, OLD.project_id)
            AND processing_status = 'completed'
        ),
        updated_at = NOW()
    WHERE id = COALESCE(NEW.project_id, OLD.project_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- Create triggers for project statistics
DROP TRIGGER IF EXISTS update_project_stats_on_document_insert ON public.project_documents;
CREATE TRIGGER update_project_stats_on_document_insert 
    AFTER INSERT ON public.project_documents
    FOR EACH ROW EXECUTE FUNCTION public.update_project_statistics();

DROP TRIGGER IF EXISTS update_project_stats_on_document_update ON public.project_documents;
CREATE TRIGGER update_project_stats_on_document_update 
    AFTER UPDATE ON public.project_documents
    FOR EACH ROW EXECUTE FUNCTION public.update_project_statistics();

DROP TRIGGER IF EXISTS update_project_stats_on_document_delete ON public.project_documents;
CREATE TRIGGER update_project_stats_on_document_delete 
    AFTER DELETE ON public.project_documents
    FOR EACH ROW EXECUTE FUNCTION public.update_project_statistics();

-- ============================================
-- STEP 8: Create storage bucket for project files
-- ============================================

-- Insert storage bucket for project files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'project-documents',
    'project-documents',
    false,
    52428800, -- 50MB limit
    ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'text/csv',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]
) ON CONFLICT (id) DO NOTHING;

-- Create storage policies for project documents
DROP POLICY IF EXISTS "Users can view their own project files" ON storage.objects;
CREATE POLICY "Users can view their own project files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'project-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can upload their own project files" ON storage.objects;
CREATE POLICY "Users can upload their own project files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'project-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can update their own project files" ON storage.objects;
CREATE POLICY "Users can update their own project files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'project-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete their own project files" ON storage.objects;
CREATE POLICY "Users can delete their own project files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'project-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================
-- STEP 9: Grant necessary permissions
-- ============================================

-- Grant permissions to authenticated users
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.conversations TO authenticated;
GRANT ALL ON public.messages TO authenticated;
GRANT ALL ON public.projects TO authenticated;
GRANT ALL ON public.project_documents TO authenticated;
GRANT ALL ON public.project_conversations TO authenticated;
GRANT ALL ON public.project_messages TO authenticated;
GRANT ALL ON public.processing_jobs TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================
-- STEP 10: Final verification
-- ============================================

-- Verify all tables exist
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
    'profiles',
    'conversations', 
    'messages',
    'projects', 
    'project_documents', 
    'project_conversations', 
    'project_messages', 
    'processing_jobs'
)
ORDER BY table_name;

-- Check RLS is enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
    'profiles',
    'conversations', 
    'messages',
    'projects', 
    'project_documents', 
    'project_conversations', 
    'project_messages', 
    'processing_jobs'
);

-- Success message
SELECT 'Complete project management migration completed successfully! 🎉' as result;
