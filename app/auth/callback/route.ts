import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const error_description = requestUrl.searchParams.get('error_description');

  // Comprehensive logging for debugging
  console.log('Authentication Callback Received', {
    timestamp: new Date().toISOString(),
    url: request.url,
    method: 'GET',
    code: code ? 'present' : 'missing',
    error: error || 'none',
    error_description: error_description || 'none'
  });

  // Handle test route for health checks
  if (requestUrl.pathname.endsWith('/test')) {
    return NextResponse.json({
      status: 'callback_route_operational',
      timestamp: new Date().toISOString(),
      details: {
        method: 'GET',
        path: requestUrl.pathname
      }
    }, { status: 200 });
  }

  // Error handling for authentication errors
  if (error) {
    console.error('Authentication Error', {
      error,
      description: error_description
    });

    return NextResponse.redirect(new URL(
      `/login?error=${encodeURIComponent(error_description || error)}`, 
      request.url
    ), { status: 302 });
  }

  // Validate authorization code
  if (!code) {
    console.warn('No authorization code provided');
    return NextResponse.redirect(new URL(
      '/login?error=missing_authorization_code', 
      request.url
    ), { status: 400 });
  }

  try {
    // Create Supabase client for server-side operations
    const supabase = createRouteHandlerClient({ cookies });

    // Exchange authorization code for session
    const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

    // Handle session exchange errors
    if (sessionError) {
      console.error('Session Exchange Error', {
        message: sessionError.message,
        code: sessionError.code
      });

      return NextResponse.redirect(new URL(
        `/login?error=${encodeURIComponent(sessionError.message)}`, 
        request.url
      ), { status: 302 });
    }

    // Log successful authentication
    console.log('Authentication Successful', {
      timestamp: new Date().toISOString(),
      message: 'User session created'
    });

    // Redirect to home page or last visited page
    return NextResponse.redirect(new URL('/', request.url), { status: 302 });

  } catch (unexpectedError) {
    // Catch any unexpected errors during authentication
    console.error('Unexpected Authentication Error', {
      error: unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError)
    });

    return NextResponse.redirect(new URL(
      '/login?error=unexpected_authentication_error', 
      request.url
    ), { status: 500 });
  }
}
