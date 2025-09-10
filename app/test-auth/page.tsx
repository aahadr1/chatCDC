'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient, resetSupabaseClient } from '@/lib/supabaseClient';

export default function TestAuthPage() {
  const [status, setStatus] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showGoChatButton, setShowGoChatButton] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Forceful redirection function
  const forceRedirectToChat = () => {
    console.log('Force redirecting to chat page');
    window.location.replace('/chat');
  };

  useEffect(() => {
    const checkAuth = async () => {
      // Reset client to ensure clean state for testing
      resetSupabaseClient();
      
      const supabase = createBrowserSupabaseClient();
      
      if (!supabase) {
        const errorMsg = 'Supabase client not initialized';
        console.error(errorMsg);
        setStatus({ error: errorMsg });
        setAuthError(errorMsg);
        setLoading(false);
        return;
      }

      try {
        // Aggressive user and session check
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        // Comprehensive logging
        console.log('Authentication Verification', {
          userExists: !!user,
          sessionExists: !!session,
          userError: userError?.message,
          sessionError: sessionError?.message
        });

        // Handle authentication errors
        if (userError || sessionError) {
          const errorMsg = userError?.message || sessionError?.message || 'Authentication verification failed';
          console.error('Authentication Error:', errorMsg);
          setAuthError(errorMsg);
        }

        // Strict authentication check
        const isAuthenticated = !!user && !!session;
        
        if (isAuthenticated) {
          console.log('User fully authenticated, initiating multiple redirection strategies');
          
          // Strategy 1: Immediate window location replacement
          forceRedirectToChat();

          // Strategy 2: Delayed redirection as a fallback
          setTimeout(() => {
            if (window.location.pathname !== '/chat') {
              console.warn('Primary redirection failed, attempting secondary redirection');
              forceRedirectToChat();
            }
          }, 500);

          // Strategy 3: Programmatic navigation fallback
          try {
            window.history.replaceState(null, '', '/chat');
            window.dispatchEvent(new PopStateEvent('popstate'));
          } catch (navError) {
            console.error('Navigation state replacement failed', navError);
          }

          return;
        }

        // Set status for debugging
        setStatus({
          user: user || null,
          session: session || null,
          isAuthenticated,
          timestamp: new Date().toISOString()
        });

        setShowGoChatButton(isAuthenticated);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unexpected authentication error';
        console.error('Critical Authentication Check Failure:', error);
        setAuthError(errorMsg);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    // Enhanced auth state change listener
    const supabase = createBrowserSupabaseClient();
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth State Change Detected', { event, sessionExists: !!session });
        
        if (event === 'SIGNED_IN' && session?.user) {
          console.log('Signed In Event - Forcing Redirection');
          forceRedirectToChat();
        }
        
        checkAuth();
      });

      return () => subscription.unsubscribe();
    }
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-700">Authenticating and redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Authentication Debug Page</h1>
      
      {authError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <strong className="font-bold">Authentication Error: </strong>
          <span className="block sm:inline">{authError}</span>
          <button 
            onClick={forceRedirectToChat}
            className="ml-4 bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
          >
            Force Redirect to Chat
          </button>
        </div>
      )}

      <div className="bg-gray-100 p-4 rounded-lg mb-4">
        <pre className="whitespace-pre-wrap text-sm">
          {JSON.stringify(status, null, 2)}
        </pre>
      </div>

      <div className="mt-6 space-y-4">
        <h2 className="text-xl font-semibold">Quick Actions:</h2>
        
        <div className="flex gap-2">
          <button
            onClick={() => window.location.href = '/login'}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Go to Login Page
          </button>

          <button
            onClick={async () => {
              const supabase = createBrowserSupabaseClient();
              if (supabase) {
                try {
                  await supabase.auth.signOut();
                  window.location.reload();
                } catch (error) {
                  console.error('Sign out error:', error);
                  alert(`Failed to sign out: ${error instanceof Error ? error.message : String(error)}`);
                }
              }
            }}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Sign Out
          </button>

          {showGoChatButton && (
            <button
              onClick={() => window.location.href = '/chat'}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Go to Chat
            </button>
          )}
        </div>

        <div className="mt-4">
          <h3 className="font-semibold mb-2">Manual Tests:</h3>
          <div className="space-y-2">
            <button
              onClick={async () => {
                try {
                  const response = await fetch(`${window.location.origin}/auth/callback/test`);
                  const data = await response.json();
                  alert(`Callback route status: ${JSON.stringify(data, null, 2)}`);
                } catch (error) {
                  alert(`Callback route error: ${error instanceof Error ? error.message : String(error)}`);
                }
              }}
              className="block px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
            >
              Test Auth Callback Route
            </button>

            <button
              onClick={() => {
                const testUrl = `${window.location.origin}/auth/callback?code=test123&test=manual`;
                window.open(testUrl, '_blank');
              }}
              className="block px-3 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm"
            >
              Test Manual Auth Callback
            </button>

            <button
              onClick={() => {
                const email = prompt('Enter test email:');
                if (email) {
                  window.open(`https://your-supabase-project.supabase.co/auth/v1/signup?redirect_to=${encodeURIComponent(window.location.origin + '/auth/callback')}&email=${encodeURIComponent(email)}`, '_blank');
                }
              }}
              className="block px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
            >
              Generate Test Signup URL
            </button>
          </div>
        </div>

        <div className="mt-4">
          <h3 className="font-semibold mb-2">Supabase Dashboard Links:</h3>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>
              <a
                href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/project/default/auth/url-configuration`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Open URL Configuration
              </a>
            </li>
            <li>
              <a
                href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/project/default/auth/templates`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Open Email Templates
              </a>
            </li>
            <li>
              <a
                href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/project/default/auth/users`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                View Users
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
