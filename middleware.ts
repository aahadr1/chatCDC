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

  // Simple session check via cookie presence
  const hasSessionCookie = req.cookies.has('sb-access-token') || req.cookies.has('supabase-auth-token')

  // Redirect to auth if accessing protected route without apparent session
  if (!hasSessionCookie && isProtectedRoute) {
    const redirectUrl = req.nextUrl.clone()
    redirectUrl.pathname = '/auth'
    return NextResponse.redirect(redirectUrl)
  }

  // Redirect to chat if accessing auth page with apparent session
  if (hasSessionCookie && isAuthPage) {
    const redirectUrl = req.nextUrl.clone()
    redirectUrl.pathname = '/chat'
    return NextResponse.redirect(redirectUrl)
  }

  // Redirect root to appropriate page
  if (req.nextUrl.pathname === '/') {
    const redirectUrl = req.nextUrl.clone()
    redirectUrl.pathname = hasSessionCookie ? '/chat' : '/auth'
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