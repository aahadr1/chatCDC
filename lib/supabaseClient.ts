// DEPRECATED: This file is no longer used for client-side operations
// All database operations now go through secure server-side API routes
// This file is kept for backward compatibility but should not be used

import { createClient } from '@supabase/supabase-js'

// Public client uses NEXT_PUBLIC_ envs; ensure they are set in .env.local and Vercel
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string

// DEPRECATED: Use apiClient from @/lib/apiClient instead
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// DEPRECATED: Use apiClient.getCurrentUser() instead
export const getCurrentUser = async () => {
  console.warn('getCurrentUser is deprecated. Use apiClient.getCurrentUser() instead.')
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error }
}

// DEPRECATED: Use apiClient.signOut() instead
export const signOut = async () => {
  console.warn('signOut is deprecated. Use apiClient.signOut() instead.')
  const { error } = await supabase.auth.signOut()
  return { error }
}

// DEPRECATED: Use apiClient for session management instead
export const getSession = async () => {
  console.warn('getSession is deprecated. Use apiClient for session management instead.')
  const { data: { session }, error } = await supabase.auth.getSession()
  return { session, error }
}
