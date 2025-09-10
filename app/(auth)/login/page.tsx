'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const router = useRouter();

  // Check if user is already authenticated
  useEffect(() => {
    const checkUser = async () => {
      const supabase = createBrowserSupabaseClient();
      if (!supabase) {
        setCheckingAuth(false);
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // User is already authenticated, redirect to home
          router.push('/');
          router.refresh();
        }
      } catch (error) {
        console.error('Error checking auth:', error);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkUser();

    // Listen for auth state changes (e.g., after email confirmation)
    const supabase = createBrowserSupabaseClient();
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          router.push('/');
          router.refresh();
        }
      });

      return () => subscription.unsubscribe();
    }
  }, [router]);

  // Show loading while checking authentication
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-apple-gray-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-apple-blue-600 mx-auto mb-4"></div>
          <p className="text-apple-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setError('Authentication service not available');
      setIsLoading(false);
      return;
    }

    try {
      let result;
      
      if (isSignUp) {
        result = await supabase.auth.signUp({
          email,
          password,
        });
      } else {
        result = await supabase.auth.signInWithPassword({
          email,
          password,
        });
      }

      const { error: authError } = result;

      if (authError) {
        setError(authError.message);
        return;
      }

      if (isSignUp) {
        setError('Check your email for a confirmation link!');
        return;
      }

      // Redirect to home page
      router.push('/');
      router.refresh();
    } catch (error) {
      setError('An unexpected error occurred');
      console.error('Auth error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-apple-gray-50 to-white flex items-center justify-center px-4">
      <div className="max-w-lg w-full space-y-8">
        {/* Logo/Brand Section */}
        <div className="text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-apple-blue-500 to-apple-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <svg
              className="w-10 h-10 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          
          <h1 className="text-4xl font-bold text-apple-gray-900 mb-2">
            ChatCDC
          </h1>
          
          <h2 className="text-2xl font-semibold text-apple-gray-700 mb-3">
            {isSignUp ? 'Join ChatCDC Today' : 'Welcome Back'}
          </h2>
          
          <p className="text-apple-gray-600 text-lg max-w-md mx-auto leading-relaxed">
            {isSignUp 
              ? 'Create your account to start intelligent conversations with our advanced AI assistant powered by GPT-5'
              : 'Sign in to continue your conversations and access your chat history'
            }
          </p>
        </div>

        {/* Features highlight for new users */}
        {isSignUp && (
          <div className="bg-white rounded-2xl shadow-sm border border-apple-gray-100 p-6 space-y-4">
            <h3 className="font-semibold text-apple-gray-800 text-center mb-4">Why Choose ChatCDC?</h3>
            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-apple-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-apple-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-apple-gray-700">Advanced GPT-5 AI capabilities</span>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-apple-green-100 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-apple-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-apple-gray-700">Image analysis and understanding</span>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-apple-purple-100 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-apple-purple-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-apple-gray-700">Organized conversation history</span>
              </div>
            </div>
          </div>
        )}
        
        <div className="bg-white rounded-2xl shadow-lg border border-apple-gray-200 p-8">
          <form className="space-y-6" onSubmit={handleAuth}>
            <div className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-apple-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full px-4 py-3 border border-apple-gray-300 rounded-xl shadow-sm placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-apple-blue-500 focus:border-apple-blue-500 transition-all duration-200"
                  placeholder="Enter your email address"
                />
              </div>
              
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-apple-gray-700 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-4 py-3 border border-apple-gray-300 rounded-xl shadow-sm placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-apple-blue-500 focus:border-apple-blue-500 transition-all duration-200"
                  placeholder={isSignUp ? "Create a secure password" : "Enter your password"}
                />
                {isSignUp && (
                  <p className="mt-2 text-xs text-apple-gray-500">
                    Password should be at least 6 characters long
                  </p>
                )}
              </div>
            </div>

          {error && (
            <div className={`text-sm p-3 rounded-lg ${
              error.includes('Check your email') 
                ? 'bg-apple-green-50 text-apple-green-700 border border-apple-green-200'
                : 'bg-apple-red-50 text-apple-red-700 border border-apple-red-200'
            }`}>
              {error}
            </div>
          )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-4 px-6 border border-transparent text-base font-semibold rounded-xl text-white bg-gradient-to-r from-apple-blue-600 to-apple-blue-700 hover:from-apple-blue-700 hover:to-apple-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-apple-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                    {isSignUp ? 'Creating account...' : 'Signing in...'}
                  </div>
                ) : (
                  <>
                    {isSignUp ? '🚀 Create Account & Start Chatting' : '👋 Welcome Back'}
                  </>
                )}
              </button>
            </div>

            <div className="text-center pt-4">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                }}
                className="text-apple-blue-600 hover:text-apple-blue-500 font-semibold transition-colors duration-200 text-sm"
              >
                {isSignUp 
                  ? 'Already have an account? Sign in instead' 
                  : "New to ChatCDC? Create an account"
                }
              </button>
            </div>
          </form>
        </div>

        {/* Trust indicators */}
        <div className="text-center">
          <p className="text-sm text-apple-gray-500">
            🔒 Your data is secure and encrypted • 🌟 Powered by GPT-5
          </p>
        </div>
      </div>
    </div>
  );
}