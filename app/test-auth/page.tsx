'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function TestAuthPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }

    getUser()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-apple-gray-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-apple-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-apple-gray-50 to-white flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-apple-gray-100 p-8">
        <h1 className="text-2xl font-bold text-apple-gray-900 mb-6 text-center">
          Authentication Test
        </h1>
        
        {user ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <h2 className="font-semibold text-green-800 mb-2">✅ Authenticated</h2>
              <p className="text-green-700 text-sm">
                User ID: {user.id}
              </p>
              <p className="text-green-700 text-sm">
                Email: {user.email}
              </p>
            </div>
            
            <button
              onClick={() => supabase.auth.signOut()}
              className="w-full btn-secondary"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <h2 className="font-semibold text-red-800 mb-2">❌ Not Authenticated</h2>
              <p className="text-red-700 text-sm">
                Please sign in to access ChatCDC
              </p>
            </div>
            
            <a
              href="/login"
              className="w-full btn-primary text-center block"
            >
              Go to Login
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
