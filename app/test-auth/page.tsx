'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabaseClient';

export default function TestAuthPage() {
  const [status, setStatus] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createBrowserSupabaseClient();
      
      if (!supabase) {
        setStatus({ error: 'Supabase client not initialized' });
        setLoading(false);
        return;
      }

      try {
        // Check current user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        // Check session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        setStatus({
          user: user || null,
          userError,
          session: session || null,
          sessionError,
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          currentUrl: window.location.href,
          origin: window.location.origin,
          authCallbackUrl: `${window.location.origin}/auth/callback`,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        setStatus({ error: error instanceof Error ? error.message : 'Unknown error' });
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    // Listen for auth changes
    const supabase = createBrowserSupabaseClient();
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event, session);
        checkAuth();
      });

      return () => subscription.unsubscribe();
    }
  }, []);

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Authentication Debug Page</h1>
      
      <div className="bg-gray-100 p-4 rounded-lg">
        <pre className="whitespace-pre-wrap text-sm">
          {JSON.stringify(status, null, 2)}
        </pre>
      </div>

      <div className="mt-6 space-y-4">
        <h2 className="text-xl font-semibold">Quick Actions:</h2>
        
        <button
          onClick={() => window.location.href = '/login'}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Go to Login Page
        </button>

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
          </ul>
        </div>
      </div>
    </div>
  );
}
