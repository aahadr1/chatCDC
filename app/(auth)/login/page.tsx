'use client'

import { useEffect, useMemo, useState } from 'react'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { createBrowserSupabaseClient } from '@/lib/supabaseClient'

export default function LoginPage() {
  const [supabaseReady, setSupabaseReady] = useState(false)
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])

  useEffect(() => {
    setSupabaseReady(Boolean(supabase))
  }, [supabase])

  return (
    <div className="min-h-screen flex items-center justify-center bg-apple-gray-50 p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-apple-gray-200 p-6">
        <h1 className="text-xl font-semibold text-apple-gray-900 mb-4 text-center">Sign in to ChatCDC</h1>
        {supabaseReady && supabase && (
          <Auth
            supabaseClient={supabase}
          providers={['google', 'github']}
          appearance={{ theme: ThemeSupa }}
          theme="light"
          redirectTo="/"
          />
        )}
      </div>
    </div>
  )
}
