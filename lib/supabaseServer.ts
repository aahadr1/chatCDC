import { createServerComponentClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Server client for API routes (with service role)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Server component client (for server components)
export const createSupabaseServerClient = () => {
  const cookieStore = cookies()
  return createServerComponentClient({ cookies: () => cookieStore })
}

// Helper to get authenticated user from API route
export const getAuthenticatedUser = async (request: Request) => {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return { user: null, error: 'No authorization header' }
    }

    const token = authHeader.substring(7)
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    
    return { user, error }
  } catch (error) {
    return { user: null, error: 'Invalid token' }
  }
}

// Helper to get user ID from session
export const getUserId = async (): Promise<string | null> => {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id || null
  } catch {
    return null
  }
}
