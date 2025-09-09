import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rxbnlhwtjrwteuixotat.supabase.co') as string
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4Ym5saHd0anJ3dGV1aXhvdGF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczNzc4NDUsImV4cCI6MjA3Mjk1Mzg0NX0.V_dgZfCyu1Qb487c2ijxCB4iyAKILjLx0uExSwhPIqs') as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
