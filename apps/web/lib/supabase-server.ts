import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client using service role key.
 * Use for: RLS-protected queries, admin operations, auth verification.
 * Never expose this to the client.
 */
export function getSupabaseServer() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

/**
 * Supabase client for email/password operations.
 * Uses service role key to bypass RLS for auth operations.
 */
export function getSupabaseAuth() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
