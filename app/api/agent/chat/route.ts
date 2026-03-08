import { NextRequest } from 'next/server'
import { runPipeline, type SSEEvent } from '@/lib/agentPipeline'
import { extractText } from '@/lib/documentProcessor'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export async function POST(request: NextRequest) {
  try {
    let message = ''
    let forceDeep = false
    let enableWebSearch = false
    let fileContext = ''
    const imageUrls: string[] = []

    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      message = (formData.get('message') as string)?.trim() || ''
      forceDeep = formData.get('forceDeep') === 'true'
      enableWebSearch = formData.get('enableWebSearch') === 'true'

      const files = formData.getAll('files') as File[]
      const textParts: string[] = []

      for (const file of files) {
        if (IMAGE_TYPES.includes(file.type)) {
          const arrayBuf = await file.arrayBuffer()
          const base64 = Buffer.from(arrayBuf).toString('base64')
          imageUrls.push(`data:${file.type};base64,${base64}`)
        } else {
          try {
            const buffer = Buffer.from(await file.arrayBuffer())
            const text = await extractText(buffer, file.type, file.name)
            if (text) {
              textParts.push(`### Fichier joint : ${file.name}\n${text.slice(0, 15000)}`)
            }
          } catch (err) {
            console.warn(`Could not extract text from ${file.name}:`, err)
          }
        }
      }

      if (textParts.length > 0) {
        fileContext = textParts.join('\n\n')
      }
    } else {
      const body = await request.json()
      message = typeof body.message === 'string' ? body.message.trim() : ''
      forceDeep = body.forceDeep === true
      enableWebSearch = body.enableWebSearch === true
    }

    if (!message) {
      return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400 })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of runPipeline(message, {
            forceDeep,
            enableWebSearch,
            fileContext: fileContext || undefined,
            imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          })) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          }
        } catch (err) {
          console.error('Agent pipeline error:', err)
          const errorEvent: SSEEvent = {
            type: 'error',
            message: err instanceof Error ? err.message : 'Pipeline error',
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`))
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    console.error('POST /api/agent/chat error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
