'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient, resetSupabaseClient } from '@/lib/supabaseClient';

export default function TestAuthPage() {
  const [status, setStatus] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [redirectAttempts, setRedirectAttempts] = useState(0);

  // Controlled redirection function
  const controlledRedirectToChat = () => {
    // Limit redirect attempts to prevent infinite loops
    if (redirectAttempts >= 3) {
      console.error('Max redirect attempts reached. Manual intervention required.');
      setAuthError('Unable to redirect. Please contact support.');
      return;
    }

    console.log(`Attempting controlled redirect to chat (Attempt ${redirectAttempts + 1})`);
    
    // Increment redirect attempts
    setRedirectAttempts(prev => prev + 1);

    // Use replace to prevent adding to browser history
    window.location.replace('/chat');
  };

  useEffect(() => {
    const checkAuth = async () => {
      // Reset client to ensure clean state for testing
      resetSupabaseClient();
      
      const supabase = createBrowserSupabaseClient();
      
      if (!supabase) {
        const errorMsg = 'Supabase client initialization failed';
        console.error(errorMsg);
        setAuthError(errorMsg);
        setLoading(false);
        return;
      }

      try {
        // Comprehensive authentication check
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        // Detailed authentication logging
        console.log('Authentication Verification', {
          userExists: !!user,
          sessionExists: !!session,
          userError: userError?.message,
          sessionError: sessionError?.message
        });

        // Handle potential authentication errors
        if (userError || sessionError) {
          const errorMsg = userError?.message || sessionError?.message || 'Authentication check failed';
          console.warn('Authentication Warning:', errorMsg);
          setAuthError(errorMsg);
        }

        // Strict authentication validation
        const isAuthenticated = !!user && !!session;
        
        // Update status for debugging
        setStatus({
          user: user || null,
          session: session || null,
          isAuthenticated,
          timestamp: new Date().toISOString()
        });

        // Controlled authentication redirection
        if (isAuthenticated) {
          console.log('User authenticated, preparing controlled redirect');
          controlledRedirectToChat();
          return;
        }

      } catch (error) {
        const errorMsg = error instanceof Error 
          ? error.message 
          : 'Unexpected authentication verification error';
        
        console.error('Critical Authentication Failure:', error);
        setAuthError(errorMsg);
      } finally {
        setLoading(false);
      }
    };

    // Initial authentication check
    checkAuth();

    // Enhanced auth state change listener
    const supabase = createBrowserSupabaseClient();
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth State Change', { 
          event, 
          sessionExists: !!session 
        });
        
        // Controlled redirection on sign-in
        if (event === 'SIGNED_IN' && session?.user) {
          console.log('Sign-in detected, initiating controlled redirect');
          controlledRedirectToChat();
        }
        
        // Recheck authentication state
        checkAuth();
      });

      // Cleanup subscription
      return () => subscription.unsubscribe();
    }
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-700">Authenticating...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Authentication Debug Page</h1>
      
      {authError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <strong className="font-bold">Authentication Issue: </strong>
          <span className="block sm:inline">{authError}</span>
          {redirectAttempts < 3 && (
            <button 
              onClick={controlledRedirectToChat}
              className="ml-4 bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
            >
              Retry Redirect
            </button>
          )}
        </div>
      )}

      <div className="bg-gray-100 p-4 rounded-lg mb-4">
        <pre className="whitespace-pre-wrap text-sm">
          {JSON.stringify(status, null, 2)}
        </pre>
      </div>
    </div>
  );
}
