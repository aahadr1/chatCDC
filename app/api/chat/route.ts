import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { messages, conversationId, userId = 'anonymous' } = await request.json()

    console.log('API received messages:', messages)
    console.log('Last message content:', messages[messages.length - 1]?.content)

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 })
    }

    // For now, return a simple response to test the API
    const lastMessage = messages[messages.length - 1]
    const response = `I received your message: "${lastMessage.content}". This is a test response from the API.`

    return NextResponse.json({ 
      success: true, 
      response: response,
      message: 'API is working correctly'
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
