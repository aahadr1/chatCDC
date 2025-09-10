-- ============================================
-- Camera Recordings Migration Script
-- ============================================
-- This script adds support for camera recordings to the existing ChatCDC database

-- Enable necessary extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. Create Camera Recordings Table
-- ============================================

-- Create camera_recordings table
CREATE TABLE IF NOT EXISTS public.camera_recordings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_type TEXT NOT NULL,
    duration_seconds INTEGER DEFAULT 30,
    upload_status TEXT DEFAULT 'completed' CHECK (upload_status IN ('uploading', 'completed', 'failed')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. Create Indexes for Performance
-- ============================================

-- Indexes for camera_recordings
CREATE INDEX IF NOT EXISTS idx_camera_recordings_user_id ON public.camera_recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_camera_recordings_created_at ON public.camera_recordings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_camera_recordings_user_created ON public.camera_recordings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_camera_recordings_upload_status ON public.camera_recordings(upload_status);

-- ============================================
-- 3. Create Functions and Triggers
-- ============================================

-- Function to update updated_at timestamp for camera_recordings
CREATE OR REPLACE FUNCTION update_camera_recordings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for updated_at on camera_recordings
DROP TRIGGER IF EXISTS update_camera_recordings_updated_at ON public.camera_recordings;
CREATE TRIGGER update_camera_recordings_updated_at 
    BEFORE UPDATE ON public.camera_recordings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_camera_recordings_updated_at();

-- ============================================
-- 4. Enable Row Level Security (RLS)
-- ============================================

-- Enable RLS on camera_recordings table
ALTER TABLE public.camera_recordings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. Create RLS Policies
-- ============================================

-- Policies for camera_recordings
CREATE POLICY "Users can view own camera recordings" ON public.camera_recordings
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own camera recordings" ON public.camera_recordings
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own camera recordings" ON public.camera_recordings
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own camera recordings" ON public.camera_recordings
FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 6. Update Storage Bucket for Video Files
-- ============================================

-- Update the existing chat-files bucket to support video files
UPDATE storage.buckets 
SET 
    file_size_limit = 209715200, -- 200MB limit for videos
    allowed_mime_types = ARRAY[
        'application/pdf', 
        'text/plain', 
        'image/jpeg', 
        'image/png', 
        'image/gif', 
        'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'video/webm',
        'video/mp4',
        'video/quicktime',
        'video/x-msvideo'
    ]
WHERE id = 'chat-files';

-- ============================================
-- 7. Grant Permissions
-- ============================================

-- Grant necessary permissions to authenticated users
GRANT ALL ON public.camera_recordings TO authenticated;

-- Grant permissions for sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================
-- 8. Create Useful Functions
-- ============================================

-- Function to get user's camera recordings count
CREATE OR REPLACE FUNCTION get_user_camera_recordings_count(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER 
        FROM public.camera_recordings 
        WHERE user_id = user_uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's camera recordings with pagination
CREATE OR REPLACE FUNCTION get_user_camera_recordings(
    user_uuid UUID,
    limit_count INTEGER DEFAULT 10,
    offset_count INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    file_name TEXT,
    file_url TEXT,
    file_size BIGINT,
    file_type TEXT,
    duration_seconds INTEGER,
    upload_status TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cr.id,
        cr.file_name,
        cr.file_url,
        cr.file_size,
        cr.file_type,
        cr.duration_seconds,
        cr.upload_status,
        cr.created_at
    FROM public.camera_recordings cr
    WHERE cr.user_id = user_uuid
    ORDER BY cr.created_at DESC
    LIMIT limit_count
    OFFSET offset_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get camera recording by ID (with user check)
CREATE OR REPLACE FUNCTION get_camera_recording_by_id(recording_uuid UUID)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    file_name TEXT,
    file_path TEXT,
    file_url TEXT,
    file_size BIGINT,
    file_type TEXT,
    duration_seconds INTEGER,
    upload_status TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cr.id,
        cr.user_id,
        cr.file_name,
        cr.file_path,
        cr.file_url,
        cr.file_size,
        cr.file_type,
        cr.duration_seconds,
        cr.upload_status,
        cr.metadata,
        cr.created_at,
        cr.updated_at
    FROM public.camera_recordings cr
    WHERE cr.id = recording_uuid
    AND cr.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_user_camera_recordings_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_camera_recordings(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_camera_recording_by_id(UUID) TO authenticated;

-- ============================================
-- 9. Create Helpful Views
-- ============================================

-- View for camera recording summaries
CREATE OR REPLACE VIEW camera_recording_summaries AS
SELECT 
    cr.id,
    cr.user_id,
    cr.file_name,
    cr.file_size,
    cr.file_type,
    cr.duration_seconds,
    cr.upload_status,
    cr.created_at,
    cr.updated_at,
    p.full_name as user_name
FROM public.camera_recordings cr
LEFT JOIN public.profiles p ON cr.user_id = p.id;

-- Grant permissions on view
GRANT SELECT ON camera_recording_summaries TO authenticated;

-- ============================================
-- 10. Add Camera Recordings to Storage Policies
-- ============================================

-- Update storage policies to include camera recordings folder structure
-- The existing policies should already cover this since we use the same bucket
-- and follow the same folder structure: {user_id}/camera-recordings/{filename}

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

-- Verify the migration
DO $$
BEGIN
    RAISE NOTICE 'Camera recordings migration completed successfully!';
    RAISE NOTICE 'Table created: camera_recordings';
    RAISE NOTICE 'Storage bucket updated to support video files';
    RAISE NOTICE 'RLS policies and permissions configured';
    RAISE NOTICE 'Indexes and triggers created for performance';
    RAISE NOTICE 'Helper functions and views created';
END $$;
