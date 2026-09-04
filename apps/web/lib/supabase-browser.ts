import { createClient } from '@supabase/supabase-js';

/**
 * Client-side Supabase client using anon key.
 * Use for: auth operations (signup, login, logout), client-side queries.
 * Safe to expose to browser — anon key + RLS handles access control.
 */
let supabaseInstance: ReturnType<typeof createClient> | null = null;

export function getSupabaseBrowser() {
  if (supabaseInstance) return supabaseInstance;

  supabaseInstance = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    }
  );

  return supabaseInstance;
}
