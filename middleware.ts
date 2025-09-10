import { createMiddlewareClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  
  // Create a Supabase client configured to use cookies
  const supabase = createMiddlewareClient({ req, res })

  // Refresh session if expired - required for Server Components
  const { data: { session } } = await supabase.auth.getSession()

  const isAuthPage = req.nextUrl.pathname.startsWith('/auth')
  const isProtectedRoute = req.nextUrl.pathname.startsWith('/chat') || req.nextUrl.pathname.startsWith('/api/chat')

  // Redirect to auth if accessing protected route without session
  if (!session && isProtectedRoute) {
    const redirectUrl = req.nextUrl.clone()
    redirectUrl.pathname = '/auth'
    return NextResponse.redirect(redirectUrl)
  }

  // Redirect to chat if accessing auth page with session
  if (session && isAuthPage) {
    const redirectUrl = req.nextUrl.clone()
    redirectUrl.pathname = '/chat'
    return NextResponse.redirect(redirectUrl)
  }

  // Redirect root to appropriate page
  if (req.nextUrl.pathname === '/') {
    const redirectUrl = req.nextUrl.clone()
    redirectUrl.pathname = session ? '/chat' : '/auth'
    return NextResponse.redirect(redirectUrl)
  }

  return res
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