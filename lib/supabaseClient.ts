import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * Create a Supabase client in the browser. Returns null if env vars are missing.
 * Deferred to runtime to avoid build-time failures during prerendering.
 */
export function createBrowserSupabaseClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    // eslint-disable-next-line no-console
    console.warn('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables')
    return null
  }
  return createClient(supabaseUrl, supabaseAnonKey)
}


