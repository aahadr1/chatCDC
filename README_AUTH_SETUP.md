# ChatCDC Authentication Setup

This guide will help you set up Supabase authentication for ChatCDC.

## Prerequisites

1. A Supabase account and project
2. Node.js and npm installed

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Supabase Project Setup

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create a new project or use an existing one
3. Go to Settings > API to get your project credentials

### 3. Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Replace the values with your actual Supabase project credentials.

### 4. Database Schema

Run the SQL script in `supabase_schema.sql` in your Supabase SQL editor:

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `supabase_schema.sql`
4. Execute the script

This will create:
- User profiles table
- Conversations table
- Messages table
- Documents table
- Row Level Security (RLS) policies
- Storage bucket for file uploads

### 5. Authentication Configuration

In your Supabase project:

1. Go to Authentication > Settings
2. Configure your site URL (e.g., `http://localhost:3000` for development)
3. Add redirect URLs:
   - `http://localhost:3000/auth/callback` (development)
   - `https://yourdomain.com/auth/callback` (production)

### 6. Run the Application

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Features

- **Secure Authentication**: Email/password sign-up and sign-in
- **Protected Routes**: Middleware automatically redirects unauthenticated users
- **User Profiles**: Automatic profile creation on signup
- **Conversations**: Server-side storage of chat conversations
- **Messages**: Secure message storage with RLS
- **File Uploads**: Document storage with proper access controls
- **Modern UI**: Beautiful, responsive authentication interface

## Security Features

- Row Level Security (RLS) ensures users can only access their own data
- Server-side data storage with proper access controls
- Secure file uploads with user-specific storage paths
- Automatic session management and refresh

## File Structure

```
app/
├── (auth)/
│   └── login/
│       └── page.tsx          # Authentication page
├── auth/
│   └── callback/
│       └── route.ts          # Auth callback handler
├── chat/
│   └── page.tsx              # Main chat interface
├── layout.tsx                # Root layout
└── page.tsx                  # Home page (redirects to login)

lib/
├── supabaseClient.ts         # Client-side Supabase client
└── supabaseAdmin.ts          # Server-side Supabase client

middleware.ts                 # Route protection middleware
supabase_schema.sql          # Database schema
```

## Troubleshooting

### Common Issues

1. **Authentication not working**: Check your environment variables and Supabase project settings
2. **Database errors**: Ensure the SQL schema has been executed successfully
3. **Redirect loops**: Verify your redirect URLs in Supabase settings
4. **RLS errors**: Check that Row Level Security policies are properly configured

### Getting Help

- Check the Supabase documentation: https://supabase.com/docs
- Verify your project settings in the Supabase dashboard
- Check the browser console for any error messages
