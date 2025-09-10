import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * Create a secure Supabase admin client with comprehensive error handling
 * 
 * @returns {SupabaseClient} Supabase admin client
 * @throws {Error} If environment variables are missing or client creation fails
 */
export function createSupabaseAdminClient(): SupabaseClient {
  try {
    // Validate environment configuration
    if (!supabaseUrl) {
      const error = new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
      console.error('Supabase Admin Client Creation Error', { error: error.message });
      throw error;
    }

    if (!serviceRoleKey) {
      const error = new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
      console.error('Supabase Admin Client Creation Error', { error: error.message });
      throw error;
    }

    // Create admin client with enhanced security configuration
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        headers: {
          'x-client-info': 'nextjs-admin/1.0.0'
        }
      }
    });

    // Log admin client creation for security monitoring
    console.log('Supabase Admin Client Created', {
      timestamp: new Date().toISOString(),
      url: supabaseUrl.replace(/\/+$/, '') // Remove trailing slashes
    });

    return adminClient;
  } catch (error) {
    console.error('Failed to create Supabase admin client', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

// Create admin client instance
export const supabaseAdmin = createSupabaseAdminClient();
