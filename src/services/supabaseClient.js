import { createClient } from '@supabase/supabase-js'

// Node unit tests do not populate Vite's import.meta.env. Keeping this guard
// lets pure services be tested without manufacturing frontend credentials.
const environment = import.meta.env ?? {}
const supabaseUrl = environment.VITE_SUPABASE_URL
const supabasePublishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Create .env.local from .env.example and restart Vite.',
    )
  }
  return supabase
}
