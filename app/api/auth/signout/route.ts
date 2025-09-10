import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabaseServer'

export async function POST(request: NextRequest) {
  try {
    // Verify user authentication
    const { user, error: authError } = await getAuthenticatedUser(request as unknown as Request)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the authorization token
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
    }

    const token = authHeader.substring(7)

    // Sign out user (this will invalidate the session)
    // Note: In a production app, you might want to maintain a blacklist of tokens
    // For now, we'll just return success as the client will handle token removal

    return NextResponse.json({
      message: 'Signed out successfully'
    })

  } catch (error) {
    console.error('Sign out API error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}
