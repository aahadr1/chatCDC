# Camera Recording Feature

This document describes the camera recording functionality that has been integrated into the ChatCDC application.

## Overview

The camera recording feature allows users to:
- Record 30-second videos using their device's camera and microphone
- Upload videos directly to Supabase storage
- Store video metadata in the database
- Access their recorded videos through the application

## Features

### 🎥 Camera Recording Page (`/camera`)
- **Test Camera**: Check camera and microphone access before recording
- **30-Second Recording**: Automatic recording with countdown timer
- **Manual Stop**: Option to stop recording before 30 seconds
- **Real-time Preview**: Live camera feed during recording
- **Upload Progress**: Visual feedback during video upload
- **Error Handling**: Comprehensive error messages and status updates

### 🔧 API Endpoints

#### `POST /api/camera/upload`
Uploads a recorded video to Supabase storage and saves metadata to the database.

**Request**: FormData with `video` file
**Response**: 
```json
{
  "success": true,
  "message": "Video uploaded successfully",
  "data": {
    "id": "uuid",
    "fileName": "recording-1234567890.webm",
    "fileUrl": "https://...",
    "fileSize": 1234567,
    "fileType": "video/webm",
    "duration": 30
  }
}
```

#### `GET /api/camera/recordings`
Retrieves user's camera recordings with pagination.

**Query Parameters**:
- `limit`: Number of recordings to return (default: 10)
- `offset`: Number of recordings to skip (default: 0)

**Response**:
```json
{
  "success": true,
  "data": {
    "recordings": [...],
    "total": 25,
    "limit": 10,
    "offset": 0
  }
}
```

#### `DELETE /api/camera/recordings?id={recordingId}`
Deletes a camera recording from both storage and database.

## Database Schema

### `camera_recordings` Table
```sql
CREATE TABLE public.camera_recordings (
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
```

### Storage Configuration
- **Bucket**: `chat-files`
- **Folder Structure**: `{user_id}/camera-recordings/{filename}`
- **File Size Limit**: 200MB
- **Supported Formats**: WebM, MP4, QuickTime, AVI

## Security Features

### Row Level Security (RLS)
- Users can only access their own recordings
- All database operations are protected by RLS policies
- Storage access is restricted to user-specific folders

### File Validation
- File type validation (video files only)
- File size limits (200MB maximum)
- Secure file naming with timestamps

### Authentication
- All endpoints require valid user authentication
- Session-based access control
- Automatic cleanup of orphaned files

## Browser Compatibility

### Supported Browsers
- **Chrome/Edge**: Full support (WebM preferred)
- **Firefox**: Full support (WebM preferred)
- **Safari/iOS**: Full support (MP4 preferred)
- **Mobile Browsers**: Full support with device-specific optimizations

### Requirements
- **HTTPS**: Required in production (camera access security requirement)
- **Localhost**: Works for development
- **User Permission**: Browser will request camera/microphone access

## Installation & Setup

### 1. Database Migration
Run the SQL migration script to add camera recording support:

```bash
# Execute the migration script in your Supabase SQL editor
CAMERA_RECORDINGS_MIGRATION.sql
```

### 2. Environment Variables
Ensure these environment variables are set:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Storage Bucket
The migration script will update the existing `chat-files` bucket to support video files. If you need to create it manually:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES (
    'chat-files', 
    'chat-files', 
    false, 
    209715200, -- 200MB limit
    ARRAY['video/webm', 'video/mp4', 'video/quicktime', 'video/x-msvideo']
);
```

## Usage

### For Users
1. Navigate to `/camera` from the main chat interface
2. Click "Test Camera" to verify camera access
3. Click "Start Recording (30s)" to begin recording
4. Wait for automatic completion or click "Stop Recording" to end early
5. Video will be automatically uploaded and saved

### For Developers
```typescript
// Upload a video file
const formData = new FormData();
formData.append('video', videoFile);

const response = await fetch('/api/camera/upload', {
  method: 'POST',
  body: formData
});

// Get user's recordings
const recordings = await fetch('/api/camera/recordings?limit=10&offset=0');

// Delete a recording
const deleteResponse = await fetch(`/api/camera/recordings?id=${recordingId}`, {
  method: 'DELETE'
});
```

## File Structure

```
app/
├── api/
│   └── camera/
│       ├── upload/
│       │   └── route.ts          # Video upload endpoint
│       └── recordings/
│           └── route.ts          # List/delete recordings endpoint
├── camera/
│   └── page.tsx                  # Camera recording interface
└── chat/
    └── page.tsx                  # Updated with camera navigation

CAMERA_RECORDINGS_MIGRATION.sql   # Database migration script
```

## Performance Considerations

### File Size Management
- 200MB limit per video
- Automatic cleanup of failed uploads
- Efficient storage organization by user

### Database Optimization
- Indexed queries for fast retrieval
- Pagination support for large recording lists
- Automatic timestamp updates

### Network Optimization
- Streaming upload support
- Progress feedback for large files
- Error recovery mechanisms

## Troubleshooting

### Common Issues

1. **Camera Access Denied**
   - Ensure HTTPS in production
   - Check browser permissions
   - Try refreshing the page

2. **Upload Failures**
   - Check file size (must be < 200MB)
   - Verify network connection
   - Check Supabase storage configuration

3. **Video Playback Issues**
   - Different browsers support different formats
   - WebM is preferred for Chrome/Firefox
   - MP4 is preferred for Safari/iOS

### Debug Information
- Check browser console for detailed error messages
- Verify Supabase storage bucket configuration
- Ensure RLS policies are correctly applied

## Future Enhancements

### Planned Features
- Video compression before upload
- Thumbnail generation
- Video editing capabilities
- Sharing functionality
- Video transcription
- AI-powered video analysis

### Technical Improvements
- WebRTC optimization
- Progressive upload
- Video streaming
- Mobile app integration

## Support

For technical support or questions about the camera recording feature:
1. Check the browser console for error messages
2. Verify your Supabase configuration
3. Ensure all environment variables are set correctly
4. Review the database migration status

---

**Note**: This feature requires user consent for camera and microphone access. All recordings are stored securely and are only accessible by the recording user.
