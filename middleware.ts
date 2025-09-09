import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createMiddlewareClient({ req, res });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = req.nextUrl;
  const isAuthRoute = pathname === '/login' || pathname.startsWith('/auth');
  const isPublicAsset =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/images');

  if (isPublicAsset) return res;

  if (!user && !isAuthRoute) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/login';
    if (pathname !== '/') {
      const from = pathname + (search || '');
      redirectUrl.searchParams.set('redirectedFrom', from);
    }
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthRoute) {
    const dest = req.nextUrl.searchParams.get('redirectedFrom') || '/';
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = dest;
    redirectUrl.search = '';
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


