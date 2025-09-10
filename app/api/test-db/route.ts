import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing database connection...')
    
    // Test basic connection
    const { data: testData, error: testError } = await supabaseAdmin
      .from('projects')
      .select('count')
      .limit(1)
    
    if (testError) {
      console.error('❌ Database test failed:', testError)
      return NextResponse.json({ 
        success: false, 
        error: 'Database connection failed',
        details: testError.message 
      }, { status: 500 })
    }
    
    // Test project_conversations table
    const { data: convData, error: convError } = await supabaseAdmin
      .from('project_conversations')
      .select('count')
      .limit(1)
    
    if (convError) {
      console.error('❌ project_conversations table test failed:', convError)
      return NextResponse.json({ 
        success: false, 
        error: 'project_conversations table not found',
        details: convError.message 
      }, { status: 500 })
    }
    
    // Test project_messages table
    const { data: msgData, error: msgError } = await supabaseAdmin
      .from('project_messages')
      .select('count')
      .limit(1)
    
    if (msgError) {
      console.error('❌ project_messages table test failed:', msgError)
      return NextResponse.json({ 
        success: false, 
        error: 'project_messages table not found',
        details: msgError.message 
      }, { status: 500 })
    }
    
    console.log('✅ Database test passed')
    return NextResponse.json({ 
      success: true, 
      message: 'Database connection and tables are working',
      tables: {
        projects: 'exists',
        project_conversations: 'exists',
        project_messages: 'exists'
      }
    })
    
  } catch (error) {
    console.error('❌ Database test error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
