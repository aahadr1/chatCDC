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

  // Log detailed authentication context
  console.log('Middleware Authentication Check', {
    timestamp: new Date().toISOString(),
    path: req.nextUrl.pathname,
    userPresent: !!user,
    userError: userError?.message || 'none'
  });

  const { pathname, search } = req.nextUrl;
  
  // Define route types with stricter authentication requirements
  const protectedRoutes = [
    '/chat', 
    '/projects', 
    '/settings', 
    '/profile'
  ];

  const authRoutes = ['/login', '/signup', '/auth'];
  
  const isPublicAsset =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/images');

  // Always allow public assets
  if (isPublicAsset) return res;

  // Strict authentication check for protected routes
  if (protectedRoutes.some(route => pathname.startsWith(route))) {
    if (!user) {
      console.warn('Unauthorized access attempt to protected route', { pathname });
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = '/login';
      redirectUrl.searchParams.set('redirectedFrom', pathname + (search || ''));
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Redirect authenticated users away from auth routes
  if (user && authRoutes.some(route => pathname.startsWith(route))) {
    const dest = req.nextUrl.searchParams.get('redirectedFrom') || '/chat';
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = dest;
    redirectUrl.search = '';
    
    console.log('Redirecting authenticated user', {
      from: pathname,
      to: redirectUrl.pathname
    });

    return NextResponse.redirect(redirectUrl);
  }

  // Default case: allow the request
  return res;
}

export const config = {
  matcher: [
    // Run on all routes except these file types and paths
    '/((?!api/|_next/|_vercel/|.*\..*).*)',
  ],
};


