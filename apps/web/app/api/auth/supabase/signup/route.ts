import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '../../../../../lib/supabase-server';
import { attachSessionCookie, SESSION_COOKIE, API_URL } from '../../../../../lib/api';
import { cookies } from 'next/headers';

/**
 * POST /api/auth/supabase/signup
 *
 * Creates a user in Supabase Auth + ORQ8 backend.
 * Body: { email, password, org_name }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, org_name } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: { code: 'validation', message: 'Email and password required' } },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();

    // 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm for MVP
    });

    if (authError) {
      return NextResponse.json(
        { error: { code: 'auth', message: authError.message } },
        { status: 400 }
      );
    }

    // 2. Also create in ORQ8 backend (for backward compat)
    const res = await fetch(`${API_URL}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, org_name }),
    });

    const data = await res.json();

    if (!res.ok) {
      // Rollback: delete from Supabase
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(data, { status: res.status });
    }

    // 3. Set the ORQ8 session cookie
    const cookieStore = await cookies();
    const token = data.data?.token;
    if (token) {
      cookieStore.set({
        name: SESSION_COOKIE,
        value: token,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });
    }

    return NextResponse.json({
      data: {
        user: {
          id: authData.user.id,
          email: authData.user.email,
        },
        org: data.data?.org,
        token,
        supabase_user_id: authData.user.id,
      },
    });
  } catch (err) {
    console.error('[Supabase Signup]', err);
    return NextResponse.json(
      { error: { code: 'internal', message: 'Signup failed' } },
      { status: 500 }
    );
  }
}
