-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    user_id TEXT NOT NULL DEFAULT 'anonymous',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL DEFAULT 'anonymous',
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    file_url TEXT,
    file_name TEXT,
    feedback TEXT CHECK (feedback IN ('up', 'down')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create uploaded_files table
CREATE TABLE IF NOT EXISTS uploaded_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL DEFAULT 'anonymous',
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_type TEXT NOT NULL,
    content TEXT,
    summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_memories table for persistent context
CREATE TABLE IF NOT EXISTS user_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL DEFAULT 'anonymous',
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create chat_summaries table for long-term memory
CREATE TABLE IF NOT EXISTS chat_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    message_range JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create prompt_templates table
CREATE TABLE IF NOT EXISTS prompt_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for documents bucket
CREATE POLICY "Allow public uploads" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Allow public downloads" ON storage.objects
FOR SELECT USING (bucket_id = 'documents');

CREATE POLICY "Allow public deletes" ON storage.objects
FOR DELETE USING (bucket_id = 'documents');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_conversation_id ON uploaded_files(conversation_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_user_id ON uploaded_files(user_id);
CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_summaries_conversation_id ON chat_summaries(conversation_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_user_id ON prompt_templates(user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at 
    BEFORE UPDATE ON conversations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for anonymous access
DROP POLICY IF EXISTS "Allow anonymous access to conversations" ON conversations;
CREATE POLICY "Allow anonymous access to conversations" ON conversations FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow anonymous access to messages" ON messages;
CREATE POLICY "Allow anonymous access to messages" ON messages FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow anonymous access to uploaded_files" ON uploaded_files;
CREATE POLICY "Allow anonymous access to uploaded_files" ON uploaded_files FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow anonymous access to user_memories" ON user_memories;
CREATE POLICY "Allow anonymous access to user_memories" ON user_memories FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow anonymous access to chat_summaries" ON chat_summaries;
CREATE POLICY "Allow anonymous access to chat_summaries" ON chat_summaries FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow anonymous access to prompt_templates" ON prompt_templates;
CREATE POLICY "Allow anonymous access to prompt_templates" ON prompt_templates FOR ALL USING (true);

-- Grant necessary permissions
GRANT ALL ON conversations TO anon;
GRANT ALL ON messages TO anon;
GRANT ALL ON uploaded_files TO anon;
GRANT ALL ON user_memories TO anon;
GRANT ALL ON chat_summaries TO anon;
GRANT ALL ON prompt_templates TO anon;
GRANT USAGE ON SCHEMA storage TO anon;
GRANT SELECT ON storage.objects TO anon;
GRANT INSERT ON storage.objects TO anon;
GRANT DELETE ON storage.objects TO anon;

-- Insert default prompt templates
INSERT INTO prompt_templates (id, name, content, description, icon, is_system) VALUES
    (uuid_generate_v4(), 'Summarize', 'Please summarize the following text concisely, highlighting the key points:\n\n', 'Get a quick summary of any text', 'FileText', true),
    (uuid_generate_v4(), 'Explain', 'Please explain the following concept in simple terms that a beginner could understand:\n\n', 'Simplify complex topics', 'Brain', true),
    (uuid_generate_v4(), 'Code Review', 'Please review the following code for bugs, performance issues, and best practices. Suggest improvements:\n\n```\n', 'Get feedback on your code', 'Code', true),
    (uuid_generate_v4(), 'Translate', 'Please translate the following text to [TARGET_LANGUAGE]:\n\n', 'Translate text to any language', 'Languages', true),
    (uuid_generate_v4(), 'Improve Writing', 'Please improve the following text for clarity, grammar, and style while maintaining its original meaning:\n\n', 'Polish your writing', 'PenTool', true),
    (uuid_generate_v4(), 'Brainstorm', 'Please help me brainstorm ideas for the following topic. Generate creative and diverse suggestions:\n\n', 'Generate creative ideas', 'Sparkles', true)
ON CONFLICT DO NOTHING;
