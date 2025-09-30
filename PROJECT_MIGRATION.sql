-- Idempotent Project Schema + RLS Policies (safe to run multiple times)

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================
-- Tables (create if missing)
-- =========================

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'processing', 'completed', 'archived')),
  document_count INTEGER DEFAULT 0,
  total_characters INTEGER DEFAULT 0,
  knowledge_base TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_url TEXT,
  extracted_text TEXT,
  text_length INTEGER DEFAULT 0,
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processing_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.project_conversations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===============
-- Indexes (safe)
-- ===============

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON public.projects(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_documents_project_id ON public.project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_user_id ON public.project_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_processing_status ON public.project_documents(processing_status);

CREATE INDEX IF NOT EXISTS idx_project_conversations_project_id ON public.project_conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_project_conversations_user_id ON public.project_conversations(user_id);

CREATE INDEX IF NOT EXISTS idx_project_messages_conversation_id ON public.project_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_project_messages_project_id ON public.project_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_project_messages_created_at ON public.project_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_project_id ON public.processing_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_user_id ON public.processing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON public.processing_jobs(status);

-- =========================
-- Functions / Triggers
-- =========================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_documents_updated_at ON public.project_documents;
CREATE TRIGGER update_project_documents_updated_at
  BEFORE UPDATE ON public.project_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_conversations_updated_at ON public.project_conversations;
CREATE TRIGGER update_project_conversations_updated_at
  BEFORE UPDATE ON public.project_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_processing_jobs_updated_at ON public.processing_jobs;
CREATE TRIGGER update_processing_jobs_updated_at
  BEFORE UPDATE ON public.processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- Enable RLS (idempotent)
-- =========================

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

-- =========================
-- RLS Policies (DROP+CREATE)
-- =========================

-- Projects
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

-- Project Documents
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

-- Project Conversations
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

-- Project Messages
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

-- Processing Jobs
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

-- =========================================
-- Storage bucket + policies (idempotent)
-- =========================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-documents',
  'project-documents',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/tiff',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Drop existing storage policies (by name) and recreate
DROP POLICY IF EXISTS "Users can view their own project files" ON storage.objects;
CREATE POLICY "Users can view their own project files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'project-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can upload their own project files" ON storage.objects;
CREATE POLICY "Users can upload their own project files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can update their own project files" ON storage.objects;
CREATE POLICY "Users can update their own project files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'project-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete their own project files" ON storage.objects;
CREATE POLICY "Users can delete their own project files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'project-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- =========================
-- Grants (safe)
-- =========================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.projects TO authenticated;
GRANT ALL ON public.project_documents TO authenticated;
GRANT ALL ON public.project_conversations TO authenticated;
GRANT ALL ON public.project_messages TO authenticated;
GRANT ALL ON public.processing_jobs TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON storage.objects TO authenticated;
GRANT ALL ON storage.buckets TO authenticated;
