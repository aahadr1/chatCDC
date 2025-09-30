import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from 'canvas'

// Configure PDF.js worker
if (typeof window === 'undefined') {
  // Server-side configuration
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
}

export interface PDFPageImage {
  buffer: Buffer
  pageNumber: number
  width: number
  height: number
}

export interface PDFInfo {
  pageCount: number
  hasText: boolean
  textContent?: string
}

// Extract basic info from PDF
export async function getPDFInfo(buffer: ArrayBuffer): Promise<PDFInfo> {
  try {
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
    const pageCount = pdf.numPages

    // Try to extract text from first page to determine if it's text-based
    let hasText = false
    let textContent = ''

    if (pageCount > 0) {
      try {
        const page = await pdf.getPage(1)
        const text = await page.getTextContent()
        textContent = text.items.map((item: any) => item.str).join(' ')
        hasText = textContent.trim().length > 50
      } catch (error) {
        console.log('Could not extract text from PDF:', error)
      }
    }

    return {
      pageCount,
      hasText,
      textContent
    }
  } catch (error) {
    console.error('Error getting PDF info:', error)
    return {
      pageCount: 0,
      hasText: false
    }
  }
}

// Convert PDF page to image buffer
export async function convertPDFPageToImage(
  buffer: ArrayBuffer,
  pageNumber: number,
  scale: number = 2.0
): Promise<PDFPageImage | null> {
  try {
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale })

    // Create canvas
    const canvas = createCanvas(viewport.width, viewport.height)
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Could not get canvas context')
    }

    // Render page to canvas
    const renderContext = {
      canvasContext: context as any,
      viewport: viewport,
      canvas: canvas as any // Type assertion for compatibility
    }

    await page.render(renderContext).promise

    // Convert to buffer
    const imageBuffer = canvas.toBuffer('image/png')

    return {
      buffer: imageBuffer,
      pageNumber,
      width: viewport.width,
      height: viewport.height
    }
  } catch (error) {
    console.error(`Error converting PDF page ${pageNumber} to image:`, error)
    return null
  }
}

// Convert multiple PDF pages to images (limit for performance)
export async function convertPDFToImages(
  buffer: ArrayBuffer,
  maxPages: number = 10
): Promise<PDFPageImage[]> {
  try {
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
    const pageCount = Math.min(pdf.numPages, maxPages)
    const images: PDFPageImage[] = []

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const image = await convertPDFPageToImage(buffer, pageNum)
      if (image) {
        images.push(image)
      }
      // Small delay to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    return images
  } catch (error) {
    console.error('Error converting PDF to images:', error)
    return []
  }
}
