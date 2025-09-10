import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Create Supabase middleware client
  const supabase = createMiddlewareClient({ req, res });

  // Retrieve user session
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  // Log authentication context for debugging
  console.log('Middleware Authentication Check', {
    timestamp: new Date().toISOString(),
    path: req.nextUrl.pathname,
    userPresent: !!user,
    userError: userError?.message || 'none'
  });

  // Define route types
  const { pathname, search } = req.nextUrl;
  const isAuthRoute = pathname === '/login' || pathname.startsWith('/auth');
  const isPublicAsset =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/images');

  // Always allow public assets
  if (isPublicAsset) return res;

  // Redirect unauthenticated users from protected routes
  if (!user && !isAuthRoute) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/login';
    
    // Preserve original destination for post-login redirect
    if (pathname !== '/') {
      const from = pathname + (search || '');
      redirectUrl.searchParams.set('redirectedFrom', from);
    }

    console.log('Redirecting Unauthenticated User', {
      originalPath: pathname,
      redirectPath: redirectUrl.pathname
    });

    return NextResponse.redirect(redirectUrl);
  }

  // Redirect authenticated users away from auth routes
  if (user && isAuthRoute) {
    const dest = req.nextUrl.searchParams.get('redirectedFrom') || '/';
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = dest;
    redirectUrl.search = '';

    console.log('Redirecting Authenticated User', {
      fromPath: pathname,
      toPath: redirectUrl.pathname
    });

    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: [
    // Run on all routes except these file types and paths
    '/((?!api/|_next/|_vercel/|.*\..*).*)',
  ],
};


