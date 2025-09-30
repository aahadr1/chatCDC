import { ImageAnnotatorClient } from '@google-cloud/vision'
import axios from 'axios'

// Initialize Google Cloud Vision client
let visionClient: ImageAnnotatorClient | null = null

function getVisionClient(): ImageAnnotatorClient {
  if (!visionClient) {
    // For serverless environments, we need to handle credentials properly
    visionClient = new ImageAnnotatorClient({
      // In production, use environment variables or service account key
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      // Fallback to service account key in environment
      credentials: process.env.GOOGLE_CLOUD_VISION_KEY ? JSON.parse(process.env.GOOGLE_CLOUD_VISION_KEY) : undefined,
    })
  }
  return visionClient
}

export interface OCRResult {
  text: string
  confidence: number
  method: 'vision-api' | 'fallback' | 'error'
  pages?: number
  error?: string
}

// Extract text from image buffer using Google Cloud Vision API
export async function extractTextFromImage(imageBuffer: Buffer): Promise<OCRResult> {
  try {
    const client = getVisionClient()

    // Convert buffer to base64
    const base64Image = imageBuffer.toString('base64')

    const [result] = await client.textDetection({
      image: {
        content: base64Image,
      },
    })

    const detections = result.textAnnotations
    if (!detections || detections.length === 0) {
      return {
        text: '',
        confidence: 0,
        method: 'error',
        error: 'No text detected in image'
      }
    }

    // Get the full text (first annotation contains all text)
    const fullText = detections[0].description || ''
    const confidence = detections[0].confidence || 0

    return {
      text: fullText.trim(),
      confidence: confidence,
      method: 'vision-api'
    }
  } catch (error) {
    console.error('Google Cloud Vision API error:', error)
    return {
      text: '',
      confidence: 0,
      method: 'error',
      error: error instanceof Error ? error.message : 'Unknown OCR error'
    }
  }
}

// Fallback OCR using a free OCR service (OCR.space)
export async function extractTextFromImageFallback(imageBuffer: Buffer): Promise<OCRResult> {
  try {
    // Convert buffer to base64
    const base64Image = imageBuffer.toString('base64')

    const response = await axios.post('https://api.ocr.space/parse/image', {
      base64Image: base64Image,
      language: 'eng',
      isOverlayRequired: false,
      isSearchablePdfHideTextLayer: true
    }, {
      headers: {
        'apikey': process.env.OCR_SPACE_API_KEY || 'helloworld', // Free key for testing
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    if (response.data.IsErroredOnProcessing) {
      throw new Error(response.data.ErrorMessage?.[0] || 'OCR processing failed')
    }

    const result = response.data.ParsedResults?.[0]
    if (!result) {
      return {
        text: '',
        confidence: 0,
        method: 'error',
        error: 'No OCR results returned'
      }
    }

    return {
      text: result.ParsedText?.trim() || '',
      confidence: 0.8, // OCR.space doesn't provide confidence scores
      method: 'fallback'
    }
  } catch (error) {
    console.error('OCR.space fallback error:', error)
    return {
      text: '',
      confidence: 0,
      method: 'error',
      error: error instanceof Error ? error.message : 'Fallback OCR failed'
    }
  }
}

// Main OCR function with fallback
export async function performOCR(imageBuffer: Buffer): Promise<OCRResult> {
  // Try Google Cloud Vision first (if credentials are available)
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_VISION_KEY) {
    const result = await extractTextFromImage(imageBuffer)
    if (result.text && result.confidence > 0.5) {
      return result
    }
  }

  // Fallback to OCR.space
  return await extractTextFromImageFallback(imageBuffer)
}
