# ChatCDC Setup Instructions

Your ChatGPT-like chat application has been completely rebuilt! 🎉

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set up your Replicate API Token

1. Go to [Replicate](https://replicate.com/account/api-tokens) and get your API token
2. Create a `.env.local` file in the root directory:
```bash
cp .env.local.example .env.local
```
3. Edit `.env.local` and replace `your_replicate_api_token_here` with your actual token:
```
REPLICATE_API_TOKEN=r8_your_actual_token_here
```

### 3. Run the Application
```bash
npm run dev
```

Navigate to `http://localhost:3000` and start chatting!

## Features ✨

- **Modern ChatGPT-like Interface**: Clean, responsive design with dark sidebar
- **Real-time Streaming**: Messages stream in real-time as the AI generates responses
- **Multiple Conversations**: Create and manage multiple chat sessions
- **GPT-5 Integration**: Powered by OpenAI's GPT-5 via Replicate
- **Fallback Support**: Automatically falls back to Llama 2 if GPT-5 is unavailable
- **Auto-scroll**: Messages automatically scroll to the bottom
- **Responsive Design**: Works on desktop and mobile
- **Smart Titles**: Conversation titles are automatically generated from the first message

## Troubleshooting

### "Replicate API token not configured" Error
- Make sure you've created the `.env.local` file
- Verify your API token is correct
- Restart the development server after adding the token

### API Connection Issues
- Check your internet connection
- Verify your Replicate account has credits
- The app will automatically fallback to Llama 2 if GPT-5 is unavailable

### No Responses from AI
- Check the browser console for error messages
- Verify your API token has the correct permissions
- Try creating a new conversation

## Architecture

- **Frontend**: Next.js 14 with React and TypeScript
- **Styling**: Tailwind CSS with custom components
- **AI**: GPT-5 via Replicate API with streaming
- **State Management**: React hooks for local state
- **Icons**: Lucide React icons

## What's New

✅ **Fixed API Integration**: Properly configured GPT-5 with Replicate
✅ **Clean Modern UI**: ChatGPT-inspired design
✅ **Streaming Responses**: Real-time message streaming
✅ **Better Error Handling**: Fallback models and user-friendly errors
✅ **Improved UX**: Auto-resizing input, keyboard shortcuts
✅ **Mobile Responsive**: Works great on all devices

Your app is now fully functional! 🚀
