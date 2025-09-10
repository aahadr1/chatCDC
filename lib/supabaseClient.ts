import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Singleton Supabase client instance
let _supabaseClient: SupabaseClient | null = null;

/**
 * Create a secure Supabase client in the browser with comprehensive error handling
 * 
 * @returns {SupabaseClient | null} Supabase client or null if configuration is invalid
 */
export function createBrowserSupabaseClient(): SupabaseClient | null {
  // Return existing client if already created
  if (_supabaseClient) {
    console.log('Returning existing Supabase client');
    return _supabaseClient;
  }

  try {
    // Validate environment configuration
    if (!supabaseUrl) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
      return null;
    }

    if (!supabaseAnonKey) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
      return null;
    }

    // Create and configure Supabase client
    _supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      // Enhanced configuration options
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      global: {
        headers: {
          'x-client-info': 'nextjs-app/1.0.0'
        }
      }
    });

    // Log client creation for debugging
    console.log('Browser Supabase Client Created', {
      timestamp: new Date().toISOString(),
      url: supabaseUrl.replace(/\/+$/, '') // Remove trailing slashes
    });

    return _supabaseClient;
  } catch (error) {
    console.error('Failed to create Supabase browser client', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Safely get Supabase client, with fallback and error handling
 * 
 * @returns {SupabaseClient | null} Supabase client or null
 */
export function getSafeSupabaseClient(): SupabaseClient | null {
  return createBrowserSupabaseClient();
}

// Expose a method to reset the client (useful for testing or specific scenarios)
export function resetSupabaseClient() {
  _supabaseClient = null;
}


