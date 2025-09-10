import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabaseServer'

export async function GET(request: NextRequest) {
  try {
    // Verify user authentication
    const { user, error: authError } = await getAuthenticatedUser(request as unknown as Request)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Return user data
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.user_metadata?.display_name
      }
    })

  } catch (error) {
    console.error('Get user API error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}
