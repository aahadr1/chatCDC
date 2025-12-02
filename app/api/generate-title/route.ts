import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Use a fast model to generate a short title
    const output = await replicate.run(
      "meta/meta-llama-3-8b-instruct" as `${string}/${string}`,
      {
        input: {
          prompt: `Generate a very short title (3-6 words max) for a conversation that starts with this message. Just respond with the title, nothing else. No quotes, no punctuation at the end.

Message: "${message.substring(0, 500)}"

Title:`,
          max_tokens: 20,
          temperature: 0.7,
        }
      }
    )

    // Handle the output
    let title = ''
    if (Array.isArray(output)) {
      title = output.join('').trim()
    } else if (typeof output === 'string') {
      title = output.trim()
    }

    // Clean up the title
    title = title
      .replace(/^["']|["']$/g, '') // Remove quotes
      .replace(/\.$/, '') // Remove trailing period
      .trim()

    // Fallback if title is empty or too long
    if (!title || title.length > 50) {
      // Extract first few words from the message
      const words = message.split(' ').slice(0, 5)
      title = words.join(' ')
      if (title.length > 40) {
        title = title.substring(0, 40) + '...'
      }
    }

    return NextResponse.json({ title })

  } catch (error) {
    console.error('Generate title error:', error)
    
    // Fallback: use first words of message
    try {
      const { message } = await request.clone().json()
      const words = message.split(' ').slice(0, 5)
      let title = words.join(' ')
      if (title.length > 40) {
        title = title.substring(0, 40) + '...'
      }
      return NextResponse.json({ title })
    } catch {
      return NextResponse.json({ title: 'New Conversation' })
    }
  }
}

