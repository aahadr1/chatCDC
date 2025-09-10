import { createClient, type SupabaseClient, type AuthChangeEvent } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Singleton Supabase client instance
let _supabaseClient: SupabaseClient | null = null;

/**
 * Global error handler for Supabase-related errors
 * @param context Descriptive context for the error
 * @param error Error object or message
 */
function logSupabaseError(context: string, error: unknown) {
  console.error(`Supabase Error - ${context}:`, {
    error: error instanceof Error 
      ? {
          message: error.message,
          name: error.name,
          stack: error.stack
        } 
      : String(error)
  });
}

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

    // Add custom error handling for authentication
    _supabaseClient.auth.onAuthStateChange((event: AuthChangeEvent, session) => {
      switch (event) {
        case 'SIGNED_IN':
          console.log('User signed in successfully', { 
            userId: session?.user?.id 
          });
          break;
        case 'SIGNED_OUT':
          console.log('User signed out');
          break;
        case 'PASSWORD_RECOVERY':
          console.log('Password recovery initiated');
          break;
        case 'TOKEN_REFRESHED':
          console.log('Token refreshed');
          break;
        case 'USER_UPDATED':
          console.log('User profile updated');
          break;
        default:
          console.log('Auth state changed:', event);
      }
    });

    // Wrap potential error-prone methods with global error handling
    const originalSignIn = _supabaseClient.auth.signIn;
    _supabaseClient.auth.signIn = async (...args) => {
      try {
        return await originalSignIn.apply(_supabaseClient.auth, args);
      } catch (error) {
        logSupabaseError('Sign In Error', error);
        throw error;
      }
    };

    return _supabaseClient;
  } catch (error) {
    logSupabaseError('Client Creation Error', error);
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


