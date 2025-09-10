import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const error_description = requestUrl.searchParams.get('error_description');

  // Handle test request
  if (requestUrl.pathname.endsWith('/test')) {
    return NextResponse.json({
      status: 'callback_route_working',
      timestamp: new Date().toISOString(),
      url: request.url,
      method: 'GET'
    });
  }

  // Log for debugging
  console.log('Auth callback received:', {
    code: code ? 'present' : 'missing',
    error,
    error_description,
    url: request.url,
    pathname: requestUrl.pathname
  });

  if (error) {
    console.error('Auth error:', error, error_description);
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error_description || error)}`, request.url));
  }

  if (code) {
    try {
      const supabase = createRouteHandlerClient({ cookies });
      const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

      if (sessionError) {
        console.error('Session exchange error:', sessionError);
        return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(sessionError.message)}`, request.url));
      }

      console.log('Session created successfully');
    } catch (err) {
      console.error('Unexpected error:', err);
      return NextResponse.redirect(new URL('/login?error=unexpected_error', request.url));
    }
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(new URL('/', request.url));
}
