# GPT-5 Integration Setup Guide

## Overview
Your ChatCDC application is now configured with GPT-5 integration via Replicate. The integration is complete and ready to use once you provide the necessary API credentials.

## Current Status ✅
- ✅ GPT-5 integration code is implemented
- ✅ API routes are configured
- ✅ Frontend chat interface is ready
- ✅ Streaming responses are implemented
- ✅ Error handling is in place

## Setup Required

### 1. Get Replicate API Token
1. Go to [Replicate.com](https://replicate.com)
2. Sign up or log in to your account
3. Navigate to [API Tokens](https://replicate.com/account/api-tokens)
4. Create a new API token
5. Copy the token

### 2. Configure Environment Variables
Update your `.env.local` file with your actual Replicate API token:

```bash
# Replace with your actual Replicate API token
REPLICATE_API_TOKEN=r8_your_actual_token_here

# Supabase Configuration (optional for basic testing)
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder_key
SUPABASE_SERVICE_ROLE_KEY=placeholder_service_key
```

### 3. Test the Integration
Once you've added your API token:

1. Restart the development server:
   ```bash
   npm run dev
   ```

2. Open your browser to `http://localhost:3000/chat`

3. Send a test message to verify GPT-5 is working

## Features Available

### GPT-5 Configuration Options
The integration supports these GPT-5 parameters:
- **verbosity**: 'low' | 'medium' | 'high' (response detail level)
- **reasoning_effort**: 'minimal' | 'low' | 'medium' | 'high' (thinking depth)
- **max_completion_tokens**: Maximum response length (default: 4000)
- **system_prompt**: Custom system instructions

### Current Settings
- Verbosity: Medium
- Reasoning Effort: Minimal (for faster responses)
- Max Tokens: 4000
- System Prompt: "You are a helpful AI assistant."

## API Endpoints

### Chat API
- **POST** `/api/chat`
- **Body**: 
  ```json
  {
    "messages": [
      {"role": "user", "content": "Your message here"}
    ],
    "conversationId": "unique-conversation-id",
    "userId": "user-id"
  }
  ```
- **Response**: Server-sent events stream with GPT-5 responses

### Test API
- **GET** `/api/test` - Returns `{"message": "API is working!"}`
- **POST** `/api/test` - Returns `{"message": "POST API is working!"}`

## Troubleshooting

### Common Issues

1. **"Failed to get response" error**
   - Check that your Replicate API token is correctly set
   - Verify the token has sufficient credits
   - Check server logs for detailed error messages

2. **"Invalid supabaseUrl" error**
   - This is expected if you haven't set up Supabase
   - The app will work without Supabase for basic chat functionality

3. **Model not found errors**
   - Ensure you're using the correct model name: `"openai/gpt-5"`
   - Check Replicate's model availability

### Server Logs
Check the terminal where you're running `npm run dev` for detailed error messages and debugging information.

## Next Steps

1. **Add your Replicate API token** to `.env.local`
2. **Test the chat interface** at `http://localhost:3000/chat`
3. **Customize GPT-5 settings** in `lib/replicate.ts` if needed
4. **Set up Supabase** (optional) for conversation persistence
5. **Deploy to production** when ready

## File Structure
```
├── lib/
│   └── replicate.ts          # GPT-5 integration logic
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts      # Chat API endpoint
│   └── chat/
│       └── page.tsx          # Chat interface
└── .env.local               # Environment variables
```

The GPT-5 integration is complete and ready to use! 🚀
