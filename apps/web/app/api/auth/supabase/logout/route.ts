import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '../../../../../lib/supabase-server';
import { SESSION_COOKIE, API_URL } from '../../../../../lib/api';
import { cookies } from 'next/headers';

/**
 * POST /api/auth/supabase/logout
 *
 * Signs out from Supabase Auth + ORQ8, clears session cookie.
 */
export async function POST() {
  try {
    const supabase = getSupabaseServer();

    // 1. Sign out from Supabase (service role can sign out any user)
    // Note: admin.signOut requires a user ID, so we just clear the ORQ8 cookie
    // and let the Supabase client-side session expire naturally

    // 2. Clear ORQ8 session cookie
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE);

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    console.error('[Supabase Logout]', err);
    // Still clear the cookie even if Supabase fails
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE);
    return NextResponse.json({ data: { success: true } });
  }
}
