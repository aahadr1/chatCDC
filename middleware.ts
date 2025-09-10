import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const isAuthPage = req.nextUrl.pathname.startsWith('/auth')
  const isProtectedRoute = req.nextUrl.pathname.startsWith('/chat')
  const isApiRoute = req.nextUrl.pathname.startsWith('/api/')

  // Allow API routes to handle their own auth
  if (isApiRoute) {
    return NextResponse.next()
  }

  // Debug: Log all cookies for troubleshooting
  const allCookies = Array.from(req.cookies.keys())
  console.log('All cookies:', allCookies)

  // Check for Supabase session cookies (more comprehensive check)
  const hasSessionCookie = allCookies.some(key => 
    key.includes('supabase') || 
    key.includes('sb-') ||
    key.startsWith('auth-token') ||
    key.includes('access-token')
  )

  console.log('Has session cookie:', hasSessionCookie)

  // Only redirect root to auth, let other routes pass through for now
  if (req.nextUrl.pathname === '/') {
    const redirectUrl = req.nextUrl.clone()
    redirectUrl.pathname = '/auth'
    return NextResponse.redirect(redirectUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}