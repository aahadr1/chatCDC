declare module 'mammoth' {
  interface ExtractRawTextOptions {
    buffer: Buffer
  }

  interface ExtractRawTextResult {
    value: string
    messages: any[]
  }

  export function extractRawText(options: ExtractRawTextOptions): Promise<ExtractRawTextResult>
}
