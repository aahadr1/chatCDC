# OCR Implementation Guide

## Overview

This application now includes a complete OCR (Optical Character Recognition) system that can automatically extract text from PDF documents, including both text-based and scanned/image-based PDFs.

## How It Works

### 1. Intelligent PDF Detection
The system first analyzes each PDF to determine if it contains:
- **Text-based content**: Direct text extraction (fast, high accuracy)
- **Scanned content**: OCR processing required (slower, depends on image quality)

### 2. Multi-Strategy Processing
- **Direct Text Extraction**: For PDFs with selectable text
- **OCR Processing**: For scanned PDFs using Google Cloud Vision API
- **Fallback Service**: OCR.space API as backup

### 3. Performance Optimizations
- Processes only first 5 pages of long documents
- Intelligent confidence scoring
- Comprehensive error handling

## Setup Requirements

### 1. Google Cloud Vision API (Recommended)

**Create a Google Cloud Project:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Vision API

**Create Service Account:**
1. Go to IAM & Admin > Service Accounts
2. Create a new service account
3. Grant "Vision API User" role
4. Create and download JSON key

**Environment Variables:**
```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

### 2. OCR.space API (Fallback)

**Get API Key:**
1. Sign up at [OCR.space](https://ocr.space/ocrapi)
2. Get your free API key

**Environment Variables:**
```bash
OCR_SPACE_API_KEY=your_api_key_here
```

## Configuration Options

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to Google Cloud service account key | Yes (for primary OCR) |
| `GOOGLE_CLOUD_VISION_KEY` | Direct key (alternative to file path) | Optional |
| `OCR_SPACE_API_KEY` | Fallback OCR service key | Optional |

### Processing Limits

- **Max Pages**: 5 pages per document (configurable)
- **Max File Size**: 50MB (configurable in code)
- **Timeout**: Optimized for serverless environments

## API Usage

### Extract Text Endpoint

```typescript
POST /api/extract-text
Content-Type: application/json
Authorization: Bearer <token>

{
  "documentId": "uuid",
  "projectId": "uuid",
  "fileUrl": "https://...",
  "fileName": "document.pdf",
  "fileType": "application/pdf"
}
```

### Response Format

```typescript
{
  "success": true,
  "textLength": 1234,
  "processingMethod": "ocr-processed",
  "confidence": 85,
  "pages": 3,
  "fileSize": 1024,
  "message": "Text extracted successfully"
}
```

## Processing Methods

### 1. Direct Text (`direct-text`)
- **Use Case**: PDFs with selectable text
- **Speed**: Fast (< 1 second)
- **Accuracy**: High (90-100%)
- **Confidence**: Based on text density

### 2. OCR Processed (`ocr-processed`)
- **Use Case**: Scanned PDFs or image-based content
- **Speed**: Medium (2-10 seconds)
- **Accuracy**: Good (70-95%)
- **Confidence**: Average of page-level OCR confidence

### 3. Failed (`failed`)
- **Use Case**: Processing errors or unsupported formats
- **Speed**: Fast
- **Accuracy**: N/A
- **Confidence**: 0%

## Error Handling

The system provides detailed error messages for common issues:

- **Corrupted PDFs**: File structure validation
- **Unsupported Formats**: Clear format requirements
- **Service Unavailable**: OCR service connectivity issues
- **Processing Timeout**: Large document handling

## Production Deployment

### Vercel Configuration

1. **Environment Variables**: Set in Vercel dashboard
2. **Service Account Key**: Upload as environment secret
3. **Build Settings**: No special configuration needed

### Performance Considerations

- **Cold Starts**: OCR processing may be slower on first request
- **Memory Usage**: PDF processing requires ~100-200MB RAM
- **Network**: OCR API calls add latency (typically 1-3 seconds)

### Cost Optimization

- **Google Cloud Vision**: ~$1.50 per 1000 pages
- **OCR.space**: Free tier available (1000 requests/month)
- **Processing Limits**: Configurable page limits prevent excessive costs

## Troubleshooting

### Common Issues

1. **"No text detected"**
   - PDF may be image-only
   - Try different PDF or use higher quality scan

2. **"OCR service unavailable"**
   - Check API credentials
   - Verify network connectivity
   - Check API quotas/limits

3. **"Processing timeout"**
   - Reduce max pages setting
   - Check file size limits
   - Verify system resources

### Debug Mode

Enable detailed logging:
```typescript
console.log('OCR Debug:', {
  fileSize,
  pageCount,
  processingMethod,
  confidence
})
```

## Security Considerations

- **API Keys**: Never expose in client-side code
- **File Validation**: Server-side validation of uploaded files
- **Rate Limiting**: Built-in protection against abuse
- **Error Information**: Sanitized error messages for users

## Future Enhancements

1. **Batch Processing**: Multiple documents simultaneously
2. **Advanced OCR**: Table and form recognition
3. **Language Detection**: Automatic language identification
4. **Caching**: Results caching for repeated documents
5. **Webhooks**: Async processing notifications

## Support

For issues or questions:
1. Check application logs for detailed error information
2. Verify OCR service credentials and quotas
3. Test with sample documents
4. Review network connectivity and API status
