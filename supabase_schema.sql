-- Supabase SQL Schema for ChatCDC Project Feature
-- Run this in your Supabase SQL editor to create the necessary tables and policies

-- Enable Row Level Security (RLS)
-- This should already be enabled by default in Supabase

-- Create projects table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'error')),
    extracted_text TEXT,
    document_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create project_documents table
CREATE TABLE IF NOT EXISTS public.project_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    filename VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    extracted_text TEXT,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create project_conversations table
CREATE TABLE IF NOT EXISTS public.project_conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    user_message TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security on all tables
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for projects table
CREATE POLICY "Users can view own projects" ON public.projects
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects" ON public.projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" ON public.projects
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects" ON public.projects
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for project_documents table
CREATE POLICY "Users can view documents of own projects" ON public.project_documents
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE projects.id = project_documents.project_id 
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert documents to own projects" ON public.project_documents
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE projects.id = project_documents.project_id 
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update documents of own projects" ON public.project_documents
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE projects.id = project_documents.project_id 
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete documents of own projects" ON public.project_documents
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE projects.id = project_documents.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- RLS Policies for project_conversations table
CREATE POLICY "Users can view conversations of own projects" ON public.project_conversations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE projects.id = project_conversations.project_id 
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert conversations to own projects" ON public.project_conversations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE projects.id = project_conversations.project_id 
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update conversations of own projects" ON public.project_conversations
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE projects.id = project_conversations.project_id 
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete conversations of own projects" ON public.project_conversations
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE projects.id = project_conversations.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON public.projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_documents_project_id ON public.project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_project_conversations_project_id ON public.project_conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_project_conversations_created_at ON public.project_conversations(created_at);

-- Optional: Create a function to update the updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at on projects table
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions (these should be set by default in Supabase)
-- GRANT USAGE ON SCHEMA public TO anon, authenticated;
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
