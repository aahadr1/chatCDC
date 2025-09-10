import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Singleton Supabase client instance
let _supabaseClient: SupabaseClient | null = null;

/**
 * Validate Supabase configuration
 * @returns {boolean} Whether the configuration is valid
 */
function validateSupabaseConfig(): boolean {
  const errors: string[] = [];

  if (!supabaseUrl) {
    errors.push('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
  }

  if (!supabaseAnonKey) {
    errors.push('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
  }

  if (errors.length > 0) {
    console.error('Supabase Configuration Errors:', errors);
    return false;
  }

  return true;
}

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

  // Validate configuration first
  if (!validateSupabaseConfig()) {
    return null;
  }

  try {
    // Ensure non-null assertion after validation
    const url = supabaseUrl!;
    const anonKey = supabaseAnonKey!;

    // Create and configure Supabase client with enhanced error handling
    _supabaseClient = createClient(url, anonKey, {
      // Enhanced configuration options
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        debug: true // Enable debug mode for more logging
      },
      global: {
        headers: {
          'x-client-info': 'nextjs-app/1.0.0'
        }
      },
      // Add detailed logging for network requests
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });

    // Log client creation for debugging
    console.log('Browser Supabase Client Created', {
      timestamp: new Date().toISOString(),
      url: url.replace(/\/+$/, ''), // Remove trailing slashes
      config: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    // Add error event listener
    _supabaseClient.on('error', (error) => {
      console.error('Supabase Client Global Error:', {
        message: error.message,
        stack: error.stack
      });
    });

    // Add custom error handling for authentication
    _supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        console.log('User signed in successfully');
      } else if (event === 'SIGN_OUT') {
        console.log('User signed out');
      } else if (event === 'AUTH_ERROR') {
        console.error('Authentication Error:', session);
      }
    });

    return _supabaseClient;
  } catch (error) {
    console.error('Failed to create Supabase browser client', {
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : String(error)
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


