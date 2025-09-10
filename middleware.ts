import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createMiddlewareClient({ req, res });
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  const { pathname, search } = req.nextUrl;
  
  // Controlled route configurations
  const routes = {
    protected: ['/chat', '/projects', '/settings', '/profile'],
    auth: ['/login', '/signup', '/auth'],
    public: ['/_next', '/static', '/favicon.ico', '/images']
  };

  // Check if the current path is a public asset
  const isPublicAsset = routes.public.some(route => pathname.startsWith(route));
  if (isPublicAsset) return res;

  // Logging with reduced verbosity
  const logRedirection = (type: string, details: Record<string, any> = {}) => {
    console.log(`Middleware Redirection - ${type}`, {
      path: pathname,
      timestamp: new Date().toISOString(),
      ...details
    });
  };

  // Protected routes require authentication
  const isProtectedRoute = routes.protected.some(route => pathname.startsWith(route));
  if (isProtectedRoute) {
    if (!user) {
      logRedirection('UNAUTHORIZED_ACCESS', { 
        attemptedPath: pathname 
      });
      
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = '/login';
      redirectUrl.searchParams.set('redirectedFrom', pathname + (search || ''));
      
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Authentication routes handling
  const isAuthRoute = routes.auth.some(route => pathname.startsWith(route));
  if (isAuthRoute && user) {
    const dest = req.nextUrl.searchParams.get('redirectedFrom') || '/chat';
    
    logRedirection('AUTHENTICATED_USER_ON_AUTH_ROUTE', { 
      destination: dest 
    });

    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = dest;
    redirectUrl.search = '';

    return NextResponse.redirect(redirectUrl);
  }

  // Home route special handling
  if (pathname === '/') {
    if (user) {
      logRedirection('HOME_ROUTE_AUTHENTICATED', { 
        destination: '/chat' 
      });
      
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = '/chat';
      return NextResponse.redirect(redirectUrl);
    }
  }

  return res;
}

export const config = {
  matcher: [
    // Run on all routes except these file types and paths
    '/((?!api/|_next/|_vercel/|.*\..*).*)',
  ],
};


