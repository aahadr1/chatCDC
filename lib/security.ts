// Security utilities and middleware for production-ready application

import { NextRequest, NextResponse } from 'next/server'

// Rate limiting store (in production, use Redis or similar)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// Security headers for all responses
export function addSecurityHeaders(response: NextResponse): NextResponse {
  // Prevent XSS attacks
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  
  // Prevent MIME type sniffing
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  
  // Content Security Policy
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.replicate.com https://*.supabase.co;"
  )
  
  // HSTS (HTTP Strict Transport Security)
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  
  return response
}

// Rate limiting middleware
export function rateLimit(
  maxRequests: number = 100,
  windowMs: number = 15 * 60 * 1000 // 15 minutes
) {
  return (request: NextRequest): NextResponse | null => {
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown'
    const now = Date.now()
    
    // Clean up expired entries
    for (const [key, value] of rateLimitStore.entries()) {
      if (now > value.resetTime) {
        rateLimitStore.delete(key)
      }
    }
    
    const current = rateLimitStore.get(ip)
    
    if (!current) {
      rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs })
      return null
    }
    
    if (now > current.resetTime) {
      rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs })
      return null
    }
    
    if (current.count >= maxRequests) {
      return new NextResponse('Too Many Requests', { status: 429 })
    }
    
    current.count++
    return null
  }
}

// Input validation utilities
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (password.length < 6) {
    errors.push('Password must be at least 6 characters long')
  }
  
  if (password.length > 128) {
    errors.push('Password must be less than 128 characters')
  }
  
  // Add more password validation rules as needed
  
  return {
    valid: errors.length === 0,
    errors
  }
}

export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, 10000) // Limit length
}

// File validation
export function validateFileType(fileName: string, allowedTypes: string[]): boolean {
  const extension = fileName.split('.').pop()?.toLowerCase()
  return extension ? allowedTypes.includes(extension) : false
}

export function validateFileSize(fileSize: number, maxSize: number): boolean {
  return fileSize <= maxSize
}

// SQL injection prevention (basic)
export function sanitizeForDatabase(input: string): string {
  return input
    .replace(/['"]/g, '') // Remove quotes
    .replace(/[;]/g, '') // Remove semicolons
    .replace(/--/g, '') // Remove SQL comments
    .replace(/\/\*/g, '') // Remove block comments
    .replace(/\*\//g, '')
}

// Request logging for security monitoring
export function logSecurityEvent(
  event: string,
  details: Record<string, any>,
  request: NextRequest
) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    ip: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown',
    url: request.url,
    method: request.method,
    details
  }
  
  // In production, send to your logging service
  console.log('SECURITY_EVENT:', JSON.stringify(logEntry))
}

// CORS configuration
export function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': process.env.NODE_ENV === 'production' 
      ? process.env.NEXTAUTH_URL || 'https://yourdomain.com'
      : 'http://localhost:3000',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

// Environment validation
export function validateEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'REPLICATE_API_TOKEN'
  ]
  
  for (const key of required) {
    if (!process.env[key]) {
      errors.push(`Missing required environment variable: ${key}`)
    }
  }
  
  // Validate Supabase URL format
  if (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('supabase.co')) {
    errors.push('Invalid Supabase URL format')
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}
