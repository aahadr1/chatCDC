import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function POST(request: NextRequest) {
  try {
    const { email, password, fullName } = await request.json()

    if (!email || !password || !fullName) {
      return NextResponse.json({ error: 'Email, password, and full name are required' }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    // Validate password strength
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    // Validate full name
    if (fullName.trim().length < 2) {
      return NextResponse.json({ error: 'Full name must be at least 2 characters' }, { status: 400 })
    }

    // Create user
    const { data, error } = await supabaseAdmin.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          display_name: fullName.trim()
        }
      }
    })

    if (error) {
      console.error('Sign up error:', error.message)
      
      // Check if user already exists
      if (error.message.includes('already registered') || error.message.includes('already exists')) {
        return NextResponse.json({ 
          error: 'User already exists with this email' 
        }, { status: 409 })
      }
      
      return NextResponse.json({ 
        error: 'Failed to create account' 
      }, { status: 400 })
    }

    if (!data.user) {
      return NextResponse.json({ 
        error: 'Account creation failed' 
      }, { status: 500 })
    }

    // Return success response
    return NextResponse.json({
      message: 'Account created successfully. Please check your email to verify your account.',
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: data.user.user_metadata?.full_name
      }
    })

  } catch (error) {
    console.error('Sign up API error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}
