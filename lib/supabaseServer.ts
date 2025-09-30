import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Server client for API routes (with service role)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null
  const cookies = header.split(';').map(c => c.trim())
  const match = cookies.find(c => c.startsWith(name + '='))
  if (!match) return null
  try {
    return decodeURIComponent(match.substring(name.length + 1))
  } catch {
    return match.substring(name.length + 1)
  }
}

// Helper to get authenticated user from API route
export const getAuthenticatedUser = async (request: Request) => {
  try {
    // Priority 1: Authorization: Bearer <token>
    const authHeader = request.headers.get('authorization')
    let token: string | null = null
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    }

    // Priority 2: Supabase auth cookies (sb-access-token)
    if (!token) {
      const cookieHeader = request.headers.get('cookie')
      token = parseCookie(cookieHeader, 'sb-access-token')
    }

    if (!token) {
      return { user: null, error: 'No token' }
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    return { user, error }
  } catch (error) {
    return { user: null, error: 'Invalid token' }
  }
}

// Helper to get user ID from session
export const getUserId = async (): Promise<string | null> => {
  try {
    // Not available without a request context; return null here
    return null
  } catch {
    return null
  }
}
